-- BarberPro AI Insights: core multi-tenant schema.
-- Tenant = one barbershop. Every tenant-owned row carries barbershop_id.
-- Money is exact numeric; dates are UTC timestamptz (reported in Asia/Manila by the app).

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.membership_role as enum ('owner', 'manager');

-- Records of payments completed outside the app. No payment processing.
create type public.payment_method as enum ('cash', 'gcash');

-- ---------------------------------------------------------------------------
-- Shared trigger: maintain updated_at
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- barbershops: one row per tenant
-- ---------------------------------------------------------------------------
create table public.barbershops (
  id          uuid primary key default gen_random_uuid(),
  name        text not null
              constraint barbershops_name_length check (char_length(btrim(name)) between 1 and 100),
  created_by  uuid not null references auth.users (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger barbershops_set_updated_at
  before update on public.barbershops
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- memberships: which users may access which barbershop, and in what role
-- ---------------------------------------------------------------------------
create table public.memberships (
  user_id        uuid not null references auth.users (id) on delete cascade,
  barbershop_id  uuid not null references public.barbershops (id) on delete cascade,
  role           public.membership_role not null default 'owner',
  created_at     timestamptz not null default now(),
  primary key (user_id, barbershop_id)
);

-- RLS helper lookups filter by barbershop_id; the PK already covers user_id-first lookups.
create index memberships_barbershop_id_idx on public.memberships (barbershop_id);

-- MVP rule: a user owns at most one barbershop. Enforced here so concurrent
-- workspace-creation requests cannot both succeed.
create unique index memberships_one_owned_shop_per_user
  on public.memberships (user_id)
  where role = 'owner';

-- ---------------------------------------------------------------------------
-- barbers
-- ---------------------------------------------------------------------------
create table public.barbers (
  id               uuid primary key default gen_random_uuid(),
  barbershop_id    uuid not null references public.barbershops (id) on delete cascade,
  name             text not null
                   constraint barbers_name_length check (char_length(btrim(name)) between 1 and 100),
  commission_rate  numeric(5,4) not null
                   constraint barbers_commission_rate_range check (commission_rate between 0 and 1),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Target for the tenant-consistent composite foreign key from sales.
  constraint barbers_barbershop_id_id_key unique (barbershop_id, id)
);

create index barbers_barbershop_active_idx on public.barbers (barbershop_id, active);

create trigger barbers_set_updated_at
  before update on public.barbers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------
create table public.services (
  id             uuid primary key default gen_random_uuid(),
  barbershop_id  uuid not null references public.barbershops (id) on delete cascade,
  name           text not null
                 constraint services_name_length check (char_length(btrim(name)) between 1 and 100),
  -- spec.md US-02 requires a positive peso price (stricter than the >= 0 floor in §5).
  price          numeric(12,2) not null
                 constraint services_price_positive check (price > 0),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint services_barbershop_id_id_key unique (barbershop_id, id)
);

create index services_barbershop_active_idx on public.services (barbershop_id, active);

create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sales: immutable records with price and commission snapshots
-- ---------------------------------------------------------------------------
create table public.sales (
  id                 uuid primary key default gen_random_uuid(),
  barbershop_id      uuid not null references public.barbershops (id) on delete cascade,
  barber_id          uuid not null,
  service_id         uuid not null,
  quantity           integer not null
                     constraint sales_quantity_range check (quantity between 1 and 20),
  unit_price         numeric(12,2) not null
                     constraint sales_unit_price_positive check (unit_price > 0),
  gross_total        numeric(12,2) not null,
  commission_rate    numeric(5,4) not null
                     constraint sales_commission_rate_range check (commission_rate between 0 and 1),
  commission_amount  numeric(12,2) not null,
  payment_method     public.payment_method not null,
  occurred_at        timestamptz not null default now(),
  -- Filled from the verified JWT by a trigger (see RLS migration); clients cannot write it.
  created_by         uuid not null default auth.uid() references auth.users (id) on delete restrict,
  request_key        uuid not null,
  created_at         timestamptz not null default now(),

  -- The barber and service must belong to the same barbershop as the sale.
  constraint sales_barber_same_shop_fkey
    foreign key (barbershop_id, barber_id)
    references public.barbers (barbershop_id, id) on delete restrict,
  constraint sales_service_same_shop_fkey
    foreign key (barbershop_id, service_id)
    references public.services (barbershop_id, id) on delete restrict,

  -- Arithmetic integrity: gross = unit_price * quantity (exact), and
  -- commission = gross * rate rounded half away from zero to centavos.
  constraint sales_gross_total_matches
    check (gross_total = unit_price * quantity),
  constraint sales_commission_amount_matches
    check (commission_amount = round(gross_total * commission_rate, 2)),

  -- Idempotency: a repeated checkout request cannot create a second sale.
  constraint sales_barbershop_request_key_key unique (barbershop_id, request_key)
);

create index sales_barbershop_occurred_at_idx on public.sales (barbershop_id, occurred_at desc);
create index sales_barbershop_barber_idx on public.sales (barbershop_id, barber_id);
create index sales_barbershop_service_idx on public.sales (barbershop_id, service_id);
create index sales_created_by_idx on public.sales (created_by);
