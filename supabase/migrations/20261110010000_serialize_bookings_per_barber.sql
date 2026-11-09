-- =============================================================================
-- Serialize bookings per barber
-- =============================================================================
-- Simultaneous book_appointment() calls for the same barber with overlapping
-- times can fail with deadlock_detected (40P01) instead of the handled
-- exclusion_violation -> 'slot_taken'. Confirmed in CI: 4 of 6 concurrent
-- overlapping bookings returned 40P01 (tests/integration/appointments.test.ts,
-- "handles many simultaneous overlapping bookings cleanly").
--
-- Fix: take a transaction-scoped advisory lock keyed on the barber before the
-- idempotency check and insert. Bookings for the same barber now run one after
-- another; bookings for different barbers are unaffected. The lock is taken
-- only after the membership check and is released automatically at
-- commit/rollback. The exclusion constraint stays as the final guarantee
-- against overlaps.
--
-- Only change from 20261108030000: the pg_advisory_xact_lock call.
-- CREATE OR REPLACE keeps the existing grants (authenticated only).
--
-- Rollback: re-run the book_appointment definition from
-- 20261108030000_appointments.sql.
-- =============================================================================

create or replace function public.book_appointment(
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

  -- Serialize per barber (see header). Held until the transaction ends.
  perform pg_advisory_xact_lock(hashtextextended('book_appointment:' || p_barber_id::text, 0));

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
