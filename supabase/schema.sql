-- ============================================================
-- Organ Transport Monitor — Supabase schema
-- Run once in the Supabase SQL editor (or via `supabase db push`).
-- Structure: all TABLES first (dependency order), then FUNCTIONS
-- + triggers, then POLICIES last — this avoids any table needing
-- to exist before another one that references it.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- PART A — TABLES
-- ============================================================

-- One row per user, extends auth.users. Replaces getUsers()/
-- saveUsers() in app.js entirely — no more plaintext passwords
-- in localStorage.
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null default 'patient_family' check (role in ('doctor', 'patient_family')),
  full_name   text not null default '',
  created_at  timestamptz not null default now()
);
alter table profiles enable row level security;

-- Gates who can become a doctor. Replaces "just click the Doctor
-- radio button" — see the bootstrapping note at the bottom.
create table doctor_invite_codes (
  code     text primary key,
  used     boolean not null default false,
  used_by  uuid references profiles (id),
  used_at  timestamptz
);
alter table doctor_invite_codes enable row level security;
-- No policies on this table at all — invisible to anon/authenticated.
-- Only redeem_doctor_invite() below (SECURITY DEFINER) can touch it.

-- One row per organ transport mission.
create table transports (
  id              uuid primary key default gen_random_uuid(),
  doctor_id       uuid not null references profiles (id),
  status          text not null default 'pending' check (status in ('pending', 'active', 'completed', 'aborted')),
  temp_mode       text not null default 'cold' check (temp_mode in ('cold', 'perfusion', 'demo')),
  system_active   boolean not null default false,
  start_location  jsonb,
  end_location    jsonb,
  created_at      timestamptz not null default now()
);
alter table transports enable row level security;

-- Links a patient-family account to a specific transport. Replaces
-- the current "there is exactly one global device, every patient
-- family login sees it" model.
create table transport_viewers (
  transport_id  uuid not null references transports (id) on delete cascade,
  profile_id    uuid not null references profiles (id) on delete cascade,
  joined_at     timestamptz not null default now(),
  primary key (transport_id, profile_id)
);
alter table transport_viewers enable row level security;

-- How a family member gets linked without a doctor manually adding
-- their user id — doctor generates a code, family redeems it.
create table transport_share_codes (
  code          text primary key,
  transport_id  uuid not null references transports (id) on delete cascade,
  created_at    timestamptz not null default now()
);
alter table transport_share_codes enable row level security;

-- Blynk token, pin map, ORS key. RLS enabled, ZERO policies for
-- anon/authenticated — only the backend's service_role key can
-- read this table. This is the entire fix for "token sitting in
-- localStorage and going out as a URL query param."
create table transport_secrets (
  transport_id      uuid primary key references transports (id) on delete cascade,
  blynk_auth_token  text,
  blynk_pin_map     jsonb,
  ors_api_key       text
);
alter table transport_secrets enable row level security;

-- Permanent sensor history — replaces the 1000-row in-memory array
-- in app.js that dies on refresh.
create table sensor_readings (
  id            bigint generated always as identity primary key,
  transport_id  uuid not null references transports (id) on delete cascade,
  ts            timestamptz not null default now(),
  temp          double precision,
  hum           double precision,
  ax            double precision,
  ay            double precision,
  az            double precision,
  tilt          double precision,
  lat           double precision,
  lng           double precision,
  ldr           integer,
  box_status    text check (box_status in ('OPEN', 'CLOSED'))
);
create index idx_sensor_readings_transport_ts on sensor_readings (transport_id, ts desc);
alter table sensor_readings enable row level security;

create table alerts (
  id            bigint generated always as identity primary key,
  transport_id  uuid not null references transports (id) on delete cascade,
  ts            timestamptz not null default now(),
  type          text not null check (type in ('temperature', 'acceleration', 'tiltAngle', 'boxStatus')),
  message       text not null,
  resolved      boolean not null default false,
  resolved_at   timestamptz
);
create index idx_alerts_transport_ts on alerts (transport_id, ts desc);
alter table alerts enable row level security;

-- Optional: persists AI chat instead of losing it on every "reset".
create table ai_messages (
  id            bigint generated always as identity primary key,
  transport_id  uuid not null references transports (id) on delete cascade,
  user_id       uuid not null references profiles (id),
  role          text not null check (role in ('user', 'assistant')),
  content       text not null,
  ts            timestamptz not null default now()
);
create index idx_ai_messages_transport_ts on ai_messages (transport_id, ts);
alter table ai_messages enable row level security;

-- ============================================================
-- PART B — FUNCTIONS + TRIGGER
-- ============================================================

-- Every new auth.users row gets a matching profiles row, always
-- starting as patient_family.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, role, full_name)
  values (new.id, 'patient_family', coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Upgrades the caller to doctor if the code is valid and unused.
create or replace function redeem_doctor_invite(invite_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used boolean;
begin
  select used into v_used from doctor_invite_codes where code = invite_code for update;
  if v_used is null then
    raise exception 'invalid invite code';
  end if;
  if v_used then
    raise exception 'invite code already used';
  end if;

  update doctor_invite_codes set used = true, used_by = auth.uid(), used_at = now() where code = invite_code;
  update profiles set role = 'doctor' where id = auth.uid();
end;
$$;
grant execute on function redeem_doctor_invite(text) to authenticated;

-- Links the caller to a transport via a share code.
create or replace function join_transport(share_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transport_id uuid;
begin
  select transport_id into v_transport_id from transport_share_codes where code = share_code;
  if v_transport_id is null then
    raise exception 'invalid share code';
  end if;

  insert into transport_viewers (transport_id, profile_id)
  values (v_transport_id, auth.uid())
  on conflict do nothing;
end;
$$;
grant execute on function join_transport(text) to authenticated;

-- ============================================================
-- PART C — POLICIES (all tables now exist, order doesn't matter)
-- ============================================================

create policy "profiles_select_own" on profiles for select
  using (id = auth.uid());
-- No update policy on purpose — role only changes via redeem_doctor_invite().

create policy "transports_select_doctor_own" on transports for select
  using (doctor_id = auth.uid());

create policy "transports_select_family_linked" on transports for select
  using (exists (
    select 1 from transport_viewers tv
    where tv.transport_id = transports.id and tv.profile_id = auth.uid()
  ));

create policy "transports_insert_doctor" on transports for insert
  with check (
    doctor_id = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and role = 'doctor')
  );

create policy "transports_update_doctor_own" on transports for update
  using (doctor_id = auth.uid())
  with check (doctor_id = auth.uid());
-- No policy for patient_family beyond select — they cannot touch
-- temp_mode or system_active no matter what the frontend renders.

create policy "viewers_select_doctor" on transport_viewers for select
  using (exists (select 1 from transports t where t.id = transport_viewers.transport_id and t.doctor_id = auth.uid()));

create policy "viewers_select_self" on transport_viewers for select
  using (profile_id = auth.uid());

create policy "share_codes_doctor_manage" on transport_share_codes for all
  using (exists (select 1 from transports t where t.id = transport_share_codes.transport_id and t.doctor_id = auth.uid()))
  with check (exists (select 1 from transports t where t.id = transport_share_codes.transport_id and t.doctor_id = auth.uid()));

create policy "readings_select_doctor_own" on sensor_readings for select
  using (exists (select 1 from transports t where t.id = sensor_readings.transport_id and t.doctor_id = auth.uid()));

create policy "readings_select_family_linked" on sensor_readings for select
  using (exists (
    select 1 from transport_viewers tv
    where tv.transport_id = sensor_readings.transport_id and tv.profile_id = auth.uid()
  ));
-- No insert policy: only service_role (FastAPI, after polling Blynk) writes here.

create policy "alerts_select_doctor_own" on alerts for select
  using (exists (select 1 from transports t where t.id = alerts.transport_id and t.doctor_id = auth.uid()));

create policy "alerts_select_family_linked" on alerts for select
  using (exists (
    select 1 from transport_viewers tv
    where tv.transport_id = alerts.transport_id and tv.profile_id = auth.uid()
  ));

create policy "alerts_update_doctor_resolve" on alerts for update
  using (exists (select 1 from transports t where t.id = alerts.transport_id and t.doctor_id = auth.uid()))
  with check (exists (select 1 from transports t where t.id = alerts.transport_id and t.doctor_id = auth.uid()));
-- No insert policy: only service_role writes alerts.

create policy "ai_messages_select_participants" on ai_messages for select
  using (
    exists (select 1 from transports t where t.id = ai_messages.transport_id and t.doctor_id = auth.uid())
    or exists (select 1 from transport_viewers tv where tv.transport_id = ai_messages.transport_id and tv.profile_id = auth.uid())
  );

create policy "ai_messages_insert_participants" on ai_messages for insert
  with check (
    user_id = auth.uid()
    and (
      exists (select 1 from transports t where t.id = ai_messages.transport_id and t.doctor_id = auth.uid())
      or exists (select 1 from transport_viewers tv where tv.transport_id = ai_messages.transport_id and tv.profile_id = auth.uid())
    )
  );

-- transport_secrets and doctor_invite_codes intentionally have
-- ZERO policies — RLS enabled + no policy = fully denied to
-- anon/authenticated. Only service_role bypasses RLS.

-- ============================================================
-- BOOTSTRAPPING: the first doctor can't invite themselves.
-- After deploying, seed one code by hand in the SQL editor:
--
--   insert into doctor_invite_codes (code) values ('replace-me-once');
--
-- Then have that first person sign up (lands as patient_family)
-- and call: select redeem_doctor_invite('replace-me-once');
-- From then on, that doctor can insert further codes the same way,
-- or you can build a small "generate invite code" admin action.
-- ============================================================
