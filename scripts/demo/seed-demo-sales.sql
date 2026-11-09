-- =============================================================================
-- BarberPro AI Insights: DEMO sales generator (synthetic data for demos/tests)
-- =============================================================================
-- Inserts historical demo sales for ONE owner's barbershop so the dashboard,
-- trend charts and AI insights have realistic data.
--
-- Why SQL? The app deliberately forbids backdating (clients cannot set
-- sales.occurred_at). Historical demo data can therefore only be created by
-- the database owner, e.g. in Supabase Dashboard > SQL Editor.
--
-- Safety:
--   * Runs as the owner account (auth.uid() is set for this transaction), so
--     the created_by trigger fills created_by correctly.
--   * Uses each barber's and service's CURRENT commission rate and price, and
--     computes totals exactly as the database CHECK constraints require.
--   * Deterministic request keys: re-running never duplicates sales
--     (ON CONFLICT DO NOTHING). Remove with cleanup-demo-sales.sql.
--   * Only touches the barbershop owned by v_owner_email.
--
-- Usage: edit the three settings below, then run the whole script once.
-- =============================================================================

do $$
declare
  -- ---- Settings ------------------------------------------------------------
  v_owner_email  text := 'owner@example.com';   -- the shop owner's login email
  v_start        date := date '2026-09-01';     -- first Manila calendar day (inclusive)
  v_end          date := date '2026-11-05';     -- last Manila calendar day (inclusive)
  v_min_per_day  int  := 20;                    -- minimum sales per day
  -- --------------------------------------------------------------------------

  v_user_id   uuid;
  v_shop_id   uuid;
  v_day       date;
  v_count     int;
  v_n         int;
  v_barber    record;
  v_service   record;
  v_barber_id  uuid;
  v_service_id uuid;
  v_qty       int;
  v_gross     numeric(12,2);
  v_minutes   int;
  v_inserted  int := 0;
  v_days      int := 0;
  v_barbers   uuid[];
  v_services  uuid[];
  r           double precision;
begin
  if v_end < v_start then
    raise exception 'v_end (%) is before v_start (%)', v_end, v_start;
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(v_owner_email);
  if v_user_id is null then
    raise exception 'No user with email %', v_owner_email;
  end if;

  select barbershop_id into v_shop_id
  from public.memberships
  where user_id = v_user_id and role = 'owner';
  if v_shop_id is null then
    raise exception 'User % does not own a barbershop yet (finish onboarding first)', v_owner_email;
  end if;

  -- Act as the owner for this transaction (used by the created_by trigger).
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_id, 'role', 'authenticated')::text, true);

  -- Demo catalog, only if the shop has none (existing items are never changed).
  if not exists (select 1 from public.barbers where barbershop_id = v_shop_id and active) then
    insert into public.barbers (barbershop_id, name, commission_rate) values
      (v_shop_id, 'Paolo', 0.40), (v_shop_id, 'Migs', 0.35), (v_shop_id, 'Jun', 0.30), (v_shop_id, 'Andrei', 0.45);
  end if;
  if not exists (select 1 from public.services where barbershop_id = v_shop_id and active) then
    insert into public.services (barbershop_id, name, price) values
      (v_shop_id, 'Haircut', 250), (v_shop_id, 'Fade & Style', 350), (v_shop_id, 'Beard trim', 150),
      (v_shop_id, 'Kids cut', 180), (v_shop_id, 'Hot towel shave', 300), (v_shop_id, 'Hair color', 800);
  end if;

  select array_agg(id order by name) into v_barbers from public.barbers where barbershop_id = v_shop_id and active;
  select array_agg(id order by price) into v_services from public.services where barbershop_id = v_shop_id and active;

  -- Reproducible "random" data for the same settings.
  perform setseed(0.42);

  v_day := v_start;
  while v_day <= v_end loop
    -- Busier at the end of the week: Fri/Sat +8..15, Sun +4..9, Mon-Thu +0..6.
    v_count := v_min_per_day + case extract(isodow from v_day)::int
      when 5 then 8 + floor(random() * 8)::int
      when 6 then 10 + floor(random() * 6)::int
      when 7 then 4 + floor(random() * 6)::int
      else floor(random() * 7)::int
    end;

    for v_n in 1..v_count loop
      -- Barbers: the first one in name order is a little busier; services skew to
      -- cheaper, everyday items (the array is ordered by price).
      -- Pick the index into a variable FIRST: random() inside a WHERE clause is
      -- re-evaluated per scanned row and can match no row at all.
      v_barber_id  := v_barbers[1 + floor(power(random(), 1.3) * array_length(v_barbers, 1))::int];
      v_service_id := v_services[1 + floor(power(random(), 1.6) * array_length(v_services, 1))::int];
      select * into strict v_barber from public.barbers where id = v_barber_id;
      select * into strict v_service from public.services where id = v_service_id;

      r := random();
      v_qty := case when r < 0.86 then 1 when r < 0.97 then 2 else 3 end;
      v_gross := v_service.price * v_qty;
      -- Opening hours 9:00-20:00 Manila, weighted towards the afternoon.
      v_minutes := 540 + floor(power(random(), 0.8) * 660)::int;

      insert into public.sales (
        barbershop_id, barber_id, service_id, quantity, unit_price, gross_total,
        commission_rate, commission_amount, payment_method, occurred_at, request_key
      ) values (
        v_shop_id, v_barber.id, v_service.id, v_qty, v_service.price, v_gross,
        v_barber.commission_rate, round(v_gross * v_barber.commission_rate, 2),
        case when random() < 0.64 then 'cash'::public.payment_method else 'gcash'::public.payment_method end,
        ((v_day + make_interval(mins => v_minutes))::timestamp at time zone 'Asia/Manila'),
        -- Deterministic key per (shop, day, sequence) so re-runs don't duplicate.
        md5('barberpro-demo:' || v_shop_id || ':' || v_day || ':' || v_n)::uuid
      )
      on conflict (barbershop_id, request_key) do nothing;

      if found then v_inserted := v_inserted + 1; end if;
    end loop;

    v_days := v_days + 1;
    v_day := v_day + 1;
  end loop;

  raise notice 'Demo seed complete: % new sales over % days for %', v_inserted, v_days, v_owner_email;
end $$;
