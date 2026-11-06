-- BarberPro AI Insights: privileges, Row Level Security, and workspace creation.
-- Principle: deny by default. Table privileges limit *which columns* a role may
-- touch; RLS policies limit *which rows*. Both must allow an operation.

-- ---------------------------------------------------------------------------
-- 1. Reset table privileges (Supabase grants broad defaults to anon/authenticated)
-- ---------------------------------------------------------------------------
revoke all on table public.barbershops, public.memberships, public.barbers,
                    public.services, public.sales
  from anon, authenticated;

-- Anonymous users get nothing on tenant data.

-- barbershops: read; rename only. Creation goes through create_barbershop().
grant select on table public.barbershops to authenticated;
grant update (name) on table public.barbershops to authenticated;

-- memberships: read own rows only. Created exclusively by create_barbershop().
grant select on table public.memberships to authenticated;

-- barbers / services: owners manage catalog. No hard delete; deactivate instead.
-- barbershop_id is insert-only, so a row can never be moved to another tenant.
grant select on table public.barbers to authenticated;
grant insert (barbershop_id, name, commission_rate, active) on table public.barbers to authenticated;
grant update (name, commission_rate, active) on table public.barbers to authenticated;

grant select on table public.services to authenticated;
grant insert (barbershop_id, name, price, active) on table public.services to authenticated;
grant update (name, price, active) on table public.services to authenticated;

-- sales: insert and read only; records are immutable. occurred_at, created_by,
-- id and created_at are server-set (not grantable), so sales cannot be
-- backdated or attributed to another user.
grant select on table public.sales to authenticated;
grant insert (barbershop_id, barber_id, service_id, quantity, unit_price, gross_total,
              commission_rate, commission_amount, payment_method, request_key)
  on table public.sales to authenticated;

-- created_by is not client-writable; fill it from the verified JWT.
create function public.set_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  if new.created_by is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  return new;
end;
$$;

create trigger sales_set_created_by
  before insert on public.sales
  for each row execute function public.set_created_by();

-- ---------------------------------------------------------------------------
-- 2. Membership helpers for policies
-- SECURITY DEFINER so policies on other tables can consult memberships without
-- recursive RLS evaluation. They only ever answer for the calling user.
-- ---------------------------------------------------------------------------
create function public.is_member(p_barbershop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.barbershop_id = p_barbershop_id
      and m.user_id = (select auth.uid())
  );
$$;

create function public.is_owner(p_barbershop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.barbershop_id = p_barbershop_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

revoke all on function public.is_member(uuid), public.is_owner(uuid) from public, anon;
grant execute on function public.is_member(uuid), public.is_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.barbershops enable row level security;
alter table public.memberships enable row level security;
alter table public.barbers     enable row level security;
alter table public.services    enable row level security;
alter table public.sales       enable row level security;

-- Table owners bypass RLS unless forced; force it as defense in depth.
-- (SECURITY DEFINER functions below run as `postgres`, which has BYPASSRLS.)
alter table public.barbershops force row level security;
alter table public.memberships force row level security;
alter table public.barbers     force row level security;
alter table public.services    force row level security;
alter table public.sales       force row level security;

-- barbershops
create policy barbershops_select_member on public.barbershops
  for select to authenticated
  using (public.is_member(id));

create policy barbershops_update_owner on public.barbershops
  for update to authenticated
  using (public.is_owner(id))
  with check (public.is_owner(id));

-- memberships: a user sees only their own memberships.
create policy memberships_select_self on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()));

-- barbers
create policy barbers_select_member on public.barbers
  for select to authenticated
  using (public.is_member(barbershop_id));

create policy barbers_insert_owner on public.barbers
  for insert to authenticated
  with check (public.is_owner(barbershop_id));

create policy barbers_update_owner on public.barbers
  for update to authenticated
  using (public.is_owner(barbershop_id))
  with check (public.is_owner(barbershop_id));

-- services
create policy services_select_member on public.services
  for select to authenticated
  using (public.is_member(barbershop_id));

create policy services_insert_owner on public.services
  for insert to authenticated
  with check (public.is_owner(barbershop_id));

create policy services_update_owner on public.services
  for update to authenticated
  using (public.is_owner(barbershop_id))
  with check (public.is_owner(barbershop_id));

-- sales: any member of the shop may record and read; nobody may update/delete.
create policy sales_select_member on public.sales
  for select to authenticated
  using (public.is_member(barbershop_id));

-- A sale's snapshots must equal the shop's current, ACTIVE catalog values, so
-- price and commission rate always come from server-controlled records, even
-- when a client calls the database API directly. Combined with the arithmetic
-- CHECK constraints, gross_total and commission_amount are also fixed.
-- (If the catalog changes between read and insert, the insert is rejected and
-- the server can simply retry with fresh values.)
create policy sales_insert_member on public.sales
  for insert to authenticated
  with check (
    public.is_member(barbershop_id)
    and exists (
      select 1 from public.barbers b
      where b.id = barber_id
        and b.barbershop_id = sales.barbershop_id
        and b.active
        and b.commission_rate = sales.commission_rate
    )
    and exists (
      select 1 from public.services s
      where s.id = service_id
        and s.barbershop_id = sales.barbershop_id
        and s.active
        and s.price = sales.unit_price
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Workspace creation: one atomic, authorized server-side transaction.
-- Inserts the barbershop and the caller's owner membership together. Runs as
-- definer because clients have no INSERT privilege on either table; identity
-- comes only from the verified JWT (auth.uid()), never from a parameter.
-- ---------------------------------------------------------------------------
create function public.create_barbershop(p_name text)
returns public.barbershops
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name    text := btrim(coalesce(p_name, ''));
  v_shop    public.barbershops;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 100 then
    raise exception 'barbershop name must be 1-100 characters' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.memberships
    where user_id = v_user_id and role = 'owner'
  ) then
    raise exception 'workspace already exists' using errcode = '23505';
  end if;

  insert into public.barbershops (name, created_by)
  values (v_name, v_user_id)
  returning * into v_shop;

  -- The partial unique index on owner memberships also blocks a concurrent
  -- duplicate; that unique_violation aborts the whole function atomically.
  insert into public.memberships (user_id, barbershop_id, role)
  values (v_user_id, v_shop.id, 'owner');

  return v_shop;
end;
$$;

revoke all on function public.create_barbershop(text) from public, anon;
grant execute on function public.create_barbershop(text) to authenticated;

-- Trigger helper functions are not meant to be called directly.
revoke all on function public.set_updated_at(), public.set_created_by() from public, anon, authenticated;
