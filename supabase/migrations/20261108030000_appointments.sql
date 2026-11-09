-- BarberPro AI: appointment booking (PRD FR-14, "Book This Style").
--
-- ADDITIVE ONLY:
--   * services.duration_minutes (30/45/60, existing rows default to 30)
--   * appointments table with a database-enforced "no double booking" rule
--   * functions: appointment_slots(), book_appointment(), set_appointment_status()
-- No existing row's values change except receiving the new column default.
--
-- Owner decisions (2026-11-08): services take 30-60 minutes; the shop takes
-- bookings 10:00-21:00 Asia/Manila (every day); completing an appointment
-- records a sale automatically.
--
-- Rollback (manual, after review; deletes appointments):
--   drop function public.set_appointment_status(uuid, public.appointment_status, public.payment_method);
--   drop function public.book_appointment(uuid, uuid, uuid, timestamptz, text, text, text, uuid, text, uuid);
--   drop function public.appointment_slots(uuid, uuid, uuid, date);
--   drop function public.booking_window();
--   drop table public.appointments; drop type public.appointment_status;
--   alter table public.services drop column duration_minutes;

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Service duration
-- ---------------------------------------------------------------------------
alter table public.services
  add column duration_minutes integer not null default 30
  constraint services_duration_minutes_allowed check (duration_minutes in (30, 45, 60));

-- Column-level grants (see the RLS migration): owners may set it; RLS still
-- restricts writes to owners of the shop.
grant insert (duration_minutes), update (duration_minutes) on table public.services to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Booking window: single source of truth for opening hours.
-- ---------------------------------------------------------------------------
create function public.booking_window(out opens_at time, out closes_at time, out time_zone text, out slot_minutes integer, out max_days_ahead integer)
language sql
immutable
set search_path = ''
as $$
  select time '10:00', time '21:00', 'Asia/Manila'::text, 15, 60;
$$;

revoke all on function public.booking_window() from public, anon;
grant execute on function public.booking_window() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. appointments
-- ---------------------------------------------------------------------------
create type public.appointment_status as enum ('confirmed', 'cancelled', 'completed', 'no_show');

create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  barbershop_id   uuid not null references public.barbershops (id) on delete cascade,
  barber_id       uuid not null,
  service_id      uuid not null,
  customer_name   text not null
                  constraint appointments_customer_name_length check (char_length(btrim(customer_name)) between 1 and 100),
  customer_phone  text
                  constraint appointments_customer_phone_format check (customer_phone is null or customer_phone ~ '^[0-9+() -]{7,20}$'),
  notes           text
                  constraint appointments_notes_length check (notes is null or char_length(notes) <= 500),
  -- Chosen hairstyle (catalog id); kept even if the saved look is deleted.
  style_id        text
                  constraint appointments_style_id_format check (style_id is null or style_id ~ '^[a-z0-9-]{1,64}$'),
  saved_look_id   uuid references public.saved_looks (id) on delete set null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  status          public.appointment_status not null default 'confirmed',
  -- Sale recorded when the appointment was completed.
  sale_id         uuid references public.sales (id) on delete set null,
  request_key     uuid not null,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint appointments_barber_same_shop_fkey
    foreign key (barbershop_id, barber_id) references public.barbers (barbershop_id, id) on delete restrict,
  constraint appointments_service_same_shop_fkey
    foreign key (barbershop_id, service_id) references public.services (barbershop_id, id) on delete restrict,
  constraint appointments_ends_after_starts check (ends_at > starts_at),
  constraint appointments_completed_has_sale check (status <> 'completed' or sale_id is not null),
  constraint appointments_barbershop_request_key_key unique (barbershop_id, request_key),
  constraint appointments_sale_key unique (sale_id),

  -- No double booking: a barber can't have two active appointments that overlap.
  constraint appointments_no_overlap exclude using gist (
    barber_id extensions.gist_uuid_ops with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('confirmed', 'completed'))
);

create index appointments_shop_starts_idx on public.appointments (barbershop_id, starts_at);
create index appointments_barber_starts_idx on public.appointments (barber_id, starts_at);
create index appointments_saved_look_idx on public.appointments (saved_look_id);
create index appointments_service_idx on public.appointments (barbershop_id, service_id);
create index appointments_created_by_idx on public.appointments (created_by);

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

revoke all on table public.appointments from anon, authenticated;
grant select on table public.appointments to authenticated;

alter table public.appointments enable row level security;
alter table public.appointments force row level security;

create policy appointments_select_member on public.appointments
  for select to authenticated
  using (public.is_member(barbershop_id));

-- ---------------------------------------------------------------------------
-- 4. appointment_slots: genuinely free start times for one barber/service/day.
-- SECURITY INVOKER: reads through the caller's RLS.
-- ---------------------------------------------------------------------------
create function public.appointment_slots(
  p_barbershop_id uuid,
  p_barber_id     uuid,
  p_service_id    uuid,
  p_day           date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  w           record;
  v_duration  integer;
  v_day_start timestamptz;
  v_slots     jsonb;
begin
  if auth.uid() is null or not public.is_member(p_barbershop_id) then
    raise exception 'not a member of this barbershop' using errcode = '42501';
  end if;
  select * into w from public.booking_window();

  select s.duration_minutes into v_duration
  from public.services s
  where s.id = p_service_id and s.barbershop_id = p_barbershop_id and s.active;
  if not found then return '[]'::jsonb; end if;
  perform 1 from public.barbers b where b.id = p_barber_id and b.barbershop_id = p_barbershop_id and b.active;
  if not found then return '[]'::jsonb; end if;

  if p_day > (now() at time zone w.time_zone)::date + w.max_days_ahead then
    return '[]'::jsonb;
  end if;

  v_day_start := (p_day::timestamp) at time zone w.time_zone;

  select coalesce(jsonb_agg(to_jsonb(slot) order by slot), '[]'::jsonb) into v_slots
  from generate_series(
         v_day_start + (w.opens_at - time '00:00'),
         v_day_start + (w.closes_at - time '00:00') - make_interval(mins => v_duration),
         make_interval(mins => w.slot_minutes)
       ) as slot
  where slot >= now()
    and not exists (
      select 1 from public.appointments a
      where a.barber_id = p_barber_id
        and a.status in ('confirmed', 'completed')
        and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(slot, slot + make_interval(mins => v_duration), '[)')
    );
  return v_slots;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. book_appointment: validates everything server-side and inserts a
-- CONFIRMED appointment, or explains why not. Idempotent per request key.
-- ---------------------------------------------------------------------------
create function public.book_appointment(
  p_barbershop_id   uuid,
  p_barber_id       uuid,
  p_service_id      uuid,
  p_starts_at       timestamptz,
  p_customer_name   text,
  p_customer_phone  text,
  p_notes           text,
  p_saved_look_id   uuid,
  p_style_id        text,
  p_request_key     uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  w           record;
  v_user_id   uuid := auth.uid();
  v_duration  integer;
  v_ends_at   timestamptz;
  v_local     timestamp;
  v_style_id  text := p_style_id;
  v_existing  public.appointments;
  v_id        uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_member(p_barbershop_id) then
    raise exception 'not a member of this barbershop' using errcode = '42501';
  end if;
  if p_request_key is null then
    raise exception 'request key required' using errcode = '22023';
  end if;
  select * into w from public.booking_window();

  select * into v_existing from public.appointments
  where barbershop_id = p_barbershop_id and request_key = p_request_key;
  if found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'appointmentId', v_existing.id,
      'status', v_existing.status, 'startsAt', v_existing.starts_at, 'endsAt', v_existing.ends_at);
  end if;

  perform 1 from public.barbers b where b.id = p_barber_id and b.barbershop_id = p_barbershop_id and b.active;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid_barber'); end if;

  select s.duration_minutes into v_duration from public.services s
  where s.id = p_service_id and s.barbershop_id = p_barbershop_id and s.active;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid_service'); end if;

  if p_saved_look_id is not null then
    select l.style_id into v_style_id from public.saved_looks l
    where l.id = p_saved_look_id and l.barbershop_id = p_barbershop_id and l.delete_after > now();
    if not found then return jsonb_build_object('ok', false, 'reason', 'invalid_look'); end if;
  end if;

  -- Time rules, evaluated in the shop's time zone.
  v_ends_at := p_starts_at + make_interval(mins => v_duration);
  v_local := p_starts_at at time zone w.time_zone;
  if p_starts_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'in_past');
  end if;
  if v_local::date > (now() at time zone w.time_zone)::date + w.max_days_ahead then
    return jsonb_build_object('ok', false, 'reason', 'too_far_ahead');
  end if;
  if extract(second from v_local) <> 0 or extract(minute from v_local)::integer % w.slot_minutes <> 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_on_slot');
  end if;
  if v_local::time < w.opens_at
     or (v_ends_at at time zone w.time_zone)::time > w.closes_at
     or (v_ends_at at time zone w.time_zone)::date <> v_local::date then
    return jsonb_build_object('ok', false, 'reason', 'outside_hours');
  end if;

  begin
    insert into public.appointments (
      barbershop_id, barber_id, service_id, customer_name, customer_phone, notes,
      style_id, saved_look_id, starts_at, ends_at, request_key, created_by
    )
    values (
      p_barbershop_id, p_barber_id, p_service_id, btrim(p_customer_name),
      nullif(btrim(coalesce(p_customer_phone, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''),
      v_style_id, p_saved_look_id, p_starts_at, v_ends_at, p_request_key, v_user_id
    )
    returning id into v_id;
  exception
    when exclusion_violation then
      return jsonb_build_object('ok', false, 'reason', 'slot_taken');
    when unique_violation then
      -- Concurrent duplicate submission with the same request key.
      select * into v_existing from public.appointments
      where barbershop_id = p_barbershop_id and request_key = p_request_key;
      return jsonb_build_object('ok', true, 'duplicate', true, 'appointmentId', v_existing.id,
        'status', v_existing.status, 'startsAt', v_existing.starts_at, 'endsAt', v_existing.ends_at);
    when check_violation then
      return jsonb_build_object('ok', false, 'reason', 'invalid_details');
  end;

  return jsonb_build_object('ok', true, 'duplicate', false, 'appointmentId', v_id,
    'status', 'confirmed', 'startsAt', p_starts_at, 'endsAt', v_ends_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. set_appointment_status: cancel, no-show, or complete (which records the
-- sale atomically, using the same snapshot and rounding rules as /sales/new).
-- ---------------------------------------------------------------------------
create function public.set_appointment_status(
  p_appointment_id  uuid,
  p_status          public.appointment_status,
  p_payment_method  public.payment_method default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_appt    public.appointments;
  v_price   numeric(12,2);
  v_rate    numeric(5,4);
  v_sale_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found or not public.is_member(v_appt.barbershop_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_appt.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed', 'status', v_appt.status);
  end if;

  if p_status = 'cancelled' then
    update public.appointments set status = 'cancelled' where id = v_appt.id;
    return jsonb_build_object('ok', true, 'status', 'cancelled');
  end if;

  if p_status = 'no_show' then
    if now() < v_appt.starts_at then
      return jsonb_build_object('ok', false, 'reason', 'too_early');
    end if;
    update public.appointments set status = 'no_show' where id = v_appt.id;
    return jsonb_build_object('ok', true, 'status', 'no_show');
  end if;

  if p_status = 'completed' then
    if p_payment_method is null then
      return jsonb_build_object('ok', false, 'reason', 'payment_method_required');
    end if;
    if now() < v_appt.starts_at - interval '30 minutes' then
      return jsonb_build_object('ok', false, 'reason', 'too_early');
    end if;

    -- Current ACTIVE catalog values, as the sales RLS policy requires.
    select b.commission_rate into v_rate from public.barbers b
    where b.id = v_appt.barber_id and b.barbershop_id = v_appt.barbershop_id and b.active;
    select s.price into v_price from public.services s
    where s.id = v_appt.service_id and s.barbershop_id = v_appt.barbershop_id and s.active;
    if v_rate is null or v_price is null then
      return jsonb_build_object('ok', false, 'reason', 'catalog_inactive');
    end if;

    -- created_by is filled from the JWT by the sales trigger. The appointment
    -- id is the request key, so a sale can only ever be recorded once.
    insert into public.sales (
      barbershop_id, barber_id, service_id, quantity, unit_price, gross_total,
      commission_rate, commission_amount, payment_method, request_key
    )
    values (
      v_appt.barbershop_id, v_appt.barber_id, v_appt.service_id, 1, v_price, v_price,
      v_rate, round(v_price * v_rate, 2), p_payment_method, v_appt.id
    )
    returning id into v_sale_id;

    update public.appointments set status = 'completed', sale_id = v_sale_id where id = v_appt.id;
    return jsonb_build_object('ok', true, 'status', 'completed', 'saleId', v_sale_id);
  end if;

  raise exception 'unsupported status' using errcode = '22023';
end;
$$;

revoke all on function public.appointment_slots(uuid, uuid, uuid, date) from public, anon;
revoke all on function public.book_appointment(uuid, uuid, uuid, timestamptz, text, text, text, uuid, text, uuid) from public, anon;
revoke all on function public.set_appointment_status(uuid, public.appointment_status, public.payment_method) from public, anon;
grant execute on function public.appointment_slots(uuid, uuid, uuid, date) to authenticated;
grant execute on function public.book_appointment(uuid, uuid, uuid, timestamptz, text, text, text, uuid, text, uuid) to authenticated;
grant execute on function public.set_appointment_status(uuid, public.appointment_status, public.payment_method) to authenticated;
