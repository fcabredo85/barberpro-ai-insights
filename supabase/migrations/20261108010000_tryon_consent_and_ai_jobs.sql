-- BarberPro AI: Virtual Try-On Studio and Hairstyle Advisor, increment A/B.
--
-- ADDITIVE ONLY: creates new types, tables and functions. No existing table,
-- policy, function or row is changed.
--
--   photo_consents      versioned record of photo-processing consent (PRD FR-05)
--   ai_generation_jobs  usage, quota, idempotency and timing records (FR-09, FR-17)
--   start_ai_job()      atomic consent + quota + concurrency + idempotency gate,
--                       called BEFORE any photo is sent to the AI provider
--   finish_ai_job()     marks the caller's own pending job succeeded/failed
--
-- No photo bytes, base64 data, prompts or provider payloads are stored here.
--
-- Rollback (manual, after review; destroys consent audit records):
--   drop function public.finish_ai_job(uuid, public.ai_job_status, text, integer);
--   drop function public.start_ai_job(uuid, public.ai_feature, uuid, text, text, text);
--   drop table public.ai_generation_jobs; drop table public.photo_consents;
--   drop type public.ai_job_status; drop type public.ai_feature;

create type public.ai_feature as enum ('tryon_preview', 'hairstyle_advice');
create type public.ai_job_status as enum ('pending', 'succeeded', 'failed');

-- ---------------------------------------------------------------------------
-- photo_consents
-- ---------------------------------------------------------------------------
create table public.photo_consents (
  id              uuid primary key default gen_random_uuid(),
  barbershop_id   uuid not null references public.barbershops (id) on delete cascade,
  -- Staff member who recorded the customer's consent. Kept as audit history
  -- even if that staff account is later deleted.
  recorded_by     uuid references auth.users (id) on delete set null,
  -- ai_hairstyle_preview: send the photo to the AI provider (per request).
  -- look_storage: keep the original photo and preview in private storage.
  purpose         text not null
                  constraint photo_consents_purpose_known check (purpose in ('ai_hairstyle_preview', 'look_storage')),
  notice_version  text not null
                  constraint photo_consents_notice_version_length check (char_length(notice_version) between 1 and 64),
  granted_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  constraint photo_consents_revoked_after_granted check (revoked_at is null or revoked_at >= granted_at)
);

create index photo_consents_barbershop_idx on public.photo_consents (barbershop_id, granted_at desc);
create index photo_consents_recorded_by_idx on public.photo_consents (recorded_by);

-- ---------------------------------------------------------------------------
-- ai_generation_jobs
-- ---------------------------------------------------------------------------
create table public.ai_generation_jobs (
  id             uuid primary key default gen_random_uuid(),
  barbershop_id  uuid not null references public.barbershops (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  feature        public.ai_feature not null,
  request_key    uuid not null,
  -- CASCADE, not RESTRICT: consents are only deleted when their shop is, and an
  -- immediate RESTRICT check could abort that cascaded delete.
  consent_id     uuid references public.photo_consents (id) on delete cascade,
  style_id       text
                 constraint ai_generation_jobs_style_id_format check (style_id ~ '^[a-z0-9-]{1,64}$'),
  model          text not null
                 constraint ai_generation_jobs_model_length check (char_length(model) between 1 and 100),
  status         public.ai_job_status not null default 'pending',
  error_code     text
                 constraint ai_generation_jobs_error_code_format check (error_code ~ '^[a-z_]{1,40}$'),
  duration_ms    integer
                 constraint ai_generation_jobs_duration_positive check (duration_ms >= 0),
  created_at     timestamptz not null default now(),
  completed_at   timestamptz,

  -- Idempotency: one job per client request key per user (FR-09, PRD §13).
  constraint ai_generation_jobs_user_request_key_key unique (user_id, request_key),
  -- A photo may never be processed without a recorded consent (FR-05).
  constraint ai_generation_jobs_tryon_requires_consent
    check (feature <> 'tryon_preview' or consent_id is not null)
);

create index ai_generation_jobs_user_time_idx on public.ai_generation_jobs (user_id, feature, created_at desc);
create index ai_generation_jobs_shop_time_idx on public.ai_generation_jobs (barbershop_id, feature, created_at desc);
create index ai_generation_jobs_consent_idx on public.ai_generation_jobs (consent_id);

-- ---------------------------------------------------------------------------
-- Privileges and RLS: consents are shop records (visible to the shop's
-- members); jobs are visible only to the user who ran them. All writes go
-- through the SECURITY DEFINER functions below.
-- ---------------------------------------------------------------------------
revoke all on table public.photo_consents, public.ai_generation_jobs from anon, authenticated;
grant select on table public.photo_consents, public.ai_generation_jobs to authenticated;

alter table public.photo_consents enable row level security;
alter table public.photo_consents force row level security;
alter table public.ai_generation_jobs enable row level security;
alter table public.ai_generation_jobs force row level security;

create policy photo_consents_select_member on public.photo_consents
  for select to authenticated
  using (public.is_member(barbershop_id));

create policy ai_generation_jobs_select_self on public.ai_generation_jobs
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- start_ai_job: the gate in front of every provider call.
-- Limits are fixed here (never caller-supplied). They double as a spending
-- ceiling: the per-shop daily cap bounds provider cost per tenant.
-- ---------------------------------------------------------------------------
create function public.start_ai_job(
  p_barbershop_id           uuid,
  p_feature                 public.ai_feature,
  p_request_key             uuid,
  p_model                   text,
  p_style_id                text default null,
  p_consent_notice_version  text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id        uuid := auth.uid();
  v_now            timestamptz := now();
  v_user_minute    integer;
  v_user_day       integer;
  v_shop_day       integer;
  v_count          integer;
  v_oldest         timestamptz;
  v_existing       public.ai_job_status;
  v_consent_id     uuid;
  v_job_id         uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_member(p_barbershop_id) then
    raise exception 'not a member of this barbershop' using errcode = '42501';
  end if;
  if p_request_key is null or p_model is null then
    raise exception 'request key and model are required' using errcode = '22023';
  end if;

  if p_feature = 'tryon_preview' then
    v_user_minute := 2;  v_user_day := 10;  v_shop_day := 60;
    if p_style_id is null then
      raise exception 'style is required' using errcode = '22023';
    end if;
    if p_consent_notice_version is null then
      return jsonb_build_object('allowed', false, 'reason', 'consent_required');
    end if;
  else
    v_user_minute := 3;  v_user_day := 30;  v_shop_day := 200;
  end if;

  -- Serialize per user so concurrent requests can't both pass the checks.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 1));

  select status into v_existing
  from public.ai_generation_jobs
  where user_id = v_user_id and request_key = p_request_key;
  if found then
    return jsonb_build_object('allowed', false, 'reason', 'duplicate_request', 'status', v_existing);
  end if;

  -- Close jobs abandoned mid-request (e.g. the serverless function was killed).
  update public.ai_generation_jobs
  set status = 'failed', error_code = 'abandoned', completed_at = v_now
  where user_id = v_user_id and status = 'pending' and created_at <= v_now - interval '3 minutes';

  -- One in-flight job per user per feature.
  select count(*) into v_count
  from public.ai_generation_jobs
  where user_id = v_user_id and feature = p_feature and status = 'pending';
  if v_count > 0 then
    return jsonb_build_object('allowed', false, 'reason', 'concurrent', 'retryAfterSeconds', 15);
  end if;

  select count(*), min(created_at) into v_count, v_oldest
  from public.ai_generation_jobs
  where user_id = v_user_id and feature = p_feature and created_at > v_now - interval '1 minute';
  if v_count >= v_user_minute then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limited', 'scope', 'user_minute',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from (v_oldest + interval '1 minute' - v_now))))::integer);
  end if;

  select count(*), min(created_at) into v_count, v_oldest
  from public.ai_generation_jobs
  where user_id = v_user_id and feature = p_feature and created_at > v_now - interval '1 day';
  if v_count >= v_user_day then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limited', 'scope', 'user_day',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from (v_oldest + interval '1 day' - v_now))))::integer);
  end if;

  select count(*), min(created_at) into v_count, v_oldest
  from public.ai_generation_jobs
  where barbershop_id = p_barbershop_id and feature = p_feature and created_at > v_now - interval '1 day';
  if v_count >= v_shop_day then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limited', 'scope', 'barbershop_day',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from (v_oldest + interval '1 day' - v_now))))::integer);
  end if;

  -- Record consent in the same transaction as the job, before any provider call.
  if p_feature = 'tryon_preview' then
    insert into public.photo_consents (barbershop_id, recorded_by, purpose, notice_version)
    values (p_barbershop_id, v_user_id, 'ai_hairstyle_preview', p_consent_notice_version)
    returning id into v_consent_id;
  end if;

  insert into public.ai_generation_jobs (barbershop_id, user_id, feature, request_key, consent_id, style_id, model)
  values (p_barbershop_id, v_user_id, p_feature, p_request_key, v_consent_id, p_style_id, p_model)
  returning id into v_job_id;

  return jsonb_build_object('allowed', true, 'jobId', v_job_id, 'consentId', v_consent_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- finish_ai_job: callers can only close their own pending jobs.
-- ---------------------------------------------------------------------------
create function public.finish_ai_job(
  p_job_id       uuid,
  p_status       public.ai_job_status,
  p_error_code   text default null,
  p_duration_ms  integer default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_status = 'pending' then
    raise exception 'final status required' using errcode = '22023';
  end if;

  update public.ai_generation_jobs
  set status = p_status,
      error_code = case when p_status = 'failed' then p_error_code end,
      duration_ms = p_duration_ms,
      completed_at = now()
  where id = p_job_id and user_id = v_user_id and status = 'pending';

  return found;
end;
$$;

revoke all on function public.start_ai_job(uuid, public.ai_feature, uuid, text, text, text) from public, anon;
revoke all on function public.finish_ai_job(uuid, public.ai_job_status, text, integer) from public, anon;
grant execute on function public.start_ai_job(uuid, public.ai_feature, uuid, text, text, text) to authenticated;
grant execute on function public.finish_ai_job(uuid, public.ai_job_status, text, integer) to authenticated;
