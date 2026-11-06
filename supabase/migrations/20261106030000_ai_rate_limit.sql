-- BarberPro AI Insights: basic rate limiting for AI insight requests.
--
-- Stored in Postgres so limits hold across serverless instances. Limits are
-- fixed inside the function (never caller-supplied):
--   * per barbershop: 10 requests per rolling hour
--   * per user:        2 requests per rolling minute
-- Only requests that would reach the model are counted.

create table public.ai_insight_requests (
  id             bigint generated always as identity primary key,
  barbershop_id  uuid not null references public.barbershops (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now()
);

create index ai_insight_requests_shop_time_idx on public.ai_insight_requests (barbershop_id, created_at desc);
create index ai_insight_requests_user_time_idx on public.ai_insight_requests (user_id, created_at desc);

-- No direct client access at all; only consume_ai_insight_quota() writes here.
alter table public.ai_insight_requests enable row level security;
alter table public.ai_insight_requests force row level security;
revoke all on table public.ai_insight_requests from anon, authenticated;

create function public.consume_ai_insight_quota(p_barbershop_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_shop_limit   constant integer  := 10;
  c_shop_window  constant interval := interval '1 hour';
  c_user_limit   constant integer  := 2;
  c_user_window  constant interval := interval '1 minute';
  v_user_id      uuid := auth.uid();
  v_now          timestamptz := now();
  v_oldest       timestamptz;
  v_count        integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_member(p_barbershop_id) then
    raise exception 'not a member of this barbershop' using errcode = '42501';
  end if;

  -- Serialize quota checks per barbershop so concurrent requests can't both pass.
  perform pg_advisory_xact_lock(hashtextextended(p_barbershop_id::text, 0));

  select count(*), min(created_at) into v_count, v_oldest
  from public.ai_insight_requests
  where user_id = v_user_id and created_at > v_now - c_user_window;
  if v_count >= c_user_limit then
    return jsonb_build_object(
      'allowed', false, 'scope', 'user',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from (v_oldest + c_user_window - v_now))))::integer
    );
  end if;

  select count(*), min(created_at) into v_count, v_oldest
  from public.ai_insight_requests
  where barbershop_id = p_barbershop_id and created_at > v_now - c_shop_window;
  if v_count >= c_shop_limit then
    return jsonb_build_object(
      'allowed', false, 'scope', 'barbershop',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from (v_oldest + c_shop_window - v_now))))::integer
    );
  end if;

  insert into public.ai_insight_requests (barbershop_id, user_id) values (p_barbershop_id, v_user_id);

  return jsonb_build_object('allowed', true, 'remaining', c_shop_limit - v_count - 1);
end;
$$;

revoke all on function public.consume_ai_insight_quota(uuid) from public, anon;
grant execute on function public.consume_ai_insight_quota(uuid) to authenticated;
