-- =============================================================================
-- BarberPro AI Insights: remove DEMO sales created by seed-demo-sales.sql
-- =============================================================================
-- Deletes only sales whose request key matches the demo generator's
-- deterministic keys for the given owner, shop and date range. Real sales
-- (random request keys from the app) are never touched.
-- Use the SAME settings you used for seeding. Run in Supabase SQL Editor.
-- =============================================================================

do $$
declare
  v_owner_email  text := 'owner@example.com';
  v_start        date := date '2026-09-01';
  v_end          date := date '2026-11-05';
  v_max_per_day  int  := 60;   -- upper bound on per-day sequence numbers to check

  v_shop_id  uuid;
  v_deleted  int;
begin
  select m.barbershop_id into v_shop_id
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where lower(u.email) = lower(v_owner_email) and m.role = 'owner';
  if v_shop_id is null then
    raise exception 'No barbershop owned by %', v_owner_email;
  end if;

  delete from public.sales s
  where s.barbershop_id = v_shop_id
    and s.request_key in (
      select md5('barberpro-demo:' || v_shop_id || ':' || d::date || ':' || n)::uuid
      from generate_series(v_start, v_end, interval '1 day') d,
           generate_series(1, v_max_per_day) n
    );
  get diagnostics v_deleted = row_count;

  raise notice 'Removed % demo sales for %', v_deleted, v_owner_email;
end $$;
