-- Mishcoin family database
-- All timestamps are America/New_York wall time (no UTC).
create table if not exists profiles (
  id text primary key,
  name_ru text default '',
  name_en text default '',
  question_count int not null default 20,
  tables_max int not null default 0,
  updated_at timestamp not null default timezone('America/New_York', now())
);

create table if not exists balances (
  profile_id text primary key,
  stars int not null default 0,
  spend int not null default 0,
  updated_at timestamp not null default timezone('America/New_York', now())
);

create table if not exists days (
  profile_id text not null,
  date date not null,
  status text not null default 'open',
  examples_correct int not null default 0,
  examples_fails int not null default 0,
  examples_answered int not null default 0,
  coins int not null default 0,
  total_coins int not null default 0,
  runs int not null default 0,
  completed_at timestamp,
  payload text default '',
  primary key (profile_id, date)
);

create table if not exists history (
  id text primary key,
  profile_id text not null,
  at timestamp,
  delta int not null default 0,
  kind text default 'lesson',
  note text default '',
  date_key text default '',
  payload text default ''
);

create table if not exists purchases (
  id text primary key,
  profile_id text not null,
  at timestamp,
  prize_id text default '',
  title_ru text default '',
  title_en text default '',
  cost int not null default 0,
  payload text default ''
);

create table if not exists claims (
  id text primary key,
  profile_id text not null,
  kind_id text default '',
  status text not null default 'new',
  at timestamp,
  decided_at timestamp,
  coins int not null default 0,
  paid boolean not null default false,
  reason text default '',
  title_ru text default '',
  title_en text default ''
);

create table if not exists claim_kinds (
  id text primary key,
  title_ru text default '',
  title_en text default '',
  coins int not null default 4,
  archived boolean not null default false,
  updated_at timestamp not null default timezone('America/New_York', now())
);

create table if not exists catalog (
  id text primary key,
  title_ru text default '',
  title_en text default '',
  cost int not null default 0,
  updated_at timestamp not null default timezone('America/New_York', now())
);

create table if not exists config (
  key text primary key,
  value text default ''
);

create table if not exists photos (
  profile_id text primary key,
  updated_at timestamp not null default timezone('America/New_York', now()),
  data_url text default ''
);

create table if not exists sessions (
  profile_id text primary key,
  device_id text not null default '',
  updated_ms bigint not null default 0,
  updated_at timestamp not null default timezone('America/New_York', now())
);

create index if not exists days_profile_idx on days (profile_id);
create index if not exists history_profile_idx on history (profile_id);
create index if not exists purchases_profile_idx on purchases (profile_id);
create index if not exists claims_profile_idx on claims (profile_id);
create index if not exists sessions_device_idx on sessions (device_id);

alter table profiles enable row level security;
alter table balances enable row level security;
alter table days enable row level security;
alter table history enable row level security;
alter table purchases enable row level security;
alter table claims enable row level security;
alter table claim_kinds enable row level security;
alter table catalog enable row level security;
alter table config enable row level security;
alter table photos enable row level security;
alter table sessions enable row level security;

drop policy if exists family_all on profiles;
drop policy if exists family_all on balances;
drop policy if exists family_all on days;
drop policy if exists family_all on history;
drop policy if exists family_all on purchases;
drop policy if exists family_all on claims;
drop policy if exists family_all on claim_kinds;
drop policy if exists family_all on catalog;
drop policy if exists family_all on config;
drop policy if exists family_all on photos;
drop policy if exists family_all on sessions;

create policy family_all on profiles for all to anon, authenticated using (true) with check (true);
create policy family_all on balances for all to anon, authenticated using (true) with check (true);
create policy family_all on days for all to anon, authenticated using (true) with check (true);
create policy family_all on history for all to anon, authenticated using (true) with check (true);
create policy family_all on purchases for all to anon, authenticated using (true) with check (true);
create policy family_all on claims for all to anon, authenticated using (true) with check (true);
create policy family_all on claim_kinds for all to anon, authenticated using (true) with check (true);
create policy family_all on catalog for all to anon, authenticated using (true) with check (true);
create policy family_all on config for all to anon, authenticated using (true) with check (true);
create policy family_all on photos for all to anon, authenticated using (true) with check (true);
create policy family_all on sessions for all to anon, authenticated using (true) with check (true);
