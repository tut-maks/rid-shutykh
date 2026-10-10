-- Рід Шутих — схема бази.
-- Принцип безпеки: браузер НІКОЛИ не звертається до бази напряму.
-- Усі таблиці під RLS без жодної політики → ключі anon/authenticated не бачать нічого.
-- Читає й пише лише сервер (Vercel-функції) ключем service_role.

create extension if not exists pgcrypto;

-- Учасники (родичі з доступом)
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null default '',
  role text not null check (role in ('owner','editor','viewer')),
  person_id text,                       -- хто це в дереві (необов'язково)
  pass_hash text,                       -- scrypt, формат scrypt$N$salt$hash
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- Одноразові запрошення (у базі лише хеш токена)
create table if not exists invites (
  token_hash text primary key,
  email text not null,
  name text not null default '',
  role text not null check (role in ('editor','viewer')),
  person_id text,
  purpose text not null default 'invite' check (purpose in ('invite','reset')),
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Сесії (у cookie — токен, у базі — лише його хеш)
create table if not exists sessions (
  token_hash text primary key,
  member_id uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  expires_at timestamptz not null,
  ua text, ip text,
  revoked boolean not null default false
);
create index if not exists sessions_member on sessions(member_id);

-- Обмеження спроб входу
create table if not exists login_attempts (
  id bigserial primary key,
  key text not null,
  at timestamptz not null default now()
);
create index if not exists login_attempts_key on login_attempts(key, at);

-- Дерево
create table if not exists persons (
  id text primary key,
  data jsonb not null,                  -- n, pt, s, m, sex, b, d, bp, note, f, mo, hyp, fam[], portrait
  deleted boolean not null default false,
  created_by uuid, created_at timestamptz not null default now(),
  updated_by uuid, updated_at timestamptz not null default now(),
  version int not null default 1
);

create table if not exists unions (
  id text primary key,
  a text not null, b text not null,
  date text,
  deleted boolean not null default false,
  created_by uuid, created_at timestamptz not null default now()
);

create table if not exists families (
  id text primary key,
  data jsonb not null,                  -- title, side, places, story(html), members[]
  sort int not null default 0,
  updated_by uuid, updated_at timestamptz not null default now()
);

create table if not exists documents (
  id text primary key,
  data jsonb not null,                  -- title, date, place, src, line, text, maybe, people[], pages[]
  sort int not null default 0,
  updated_by uuid, updated_at timestamptz not null default now()
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  person_id text not null,
  path text not null, thumb text,
  caption text not null default '',
  mime text, size int,
  deleted boolean not null default false,
  created_by uuid, created_at timestamptz not null default now()
);
create index if not exists photos_person on photos(person_id);

create table if not exists stories (
  id uuid primary key default gen_random_uuid(),
  target text not null,                 -- id людини або fam:<id>
  text text not null,
  deleted boolean not null default false,
  created_by uuid, created_at timestamptz not null default now()
);
create index if not exists stories_target on stories(target);

-- Історія всіх змін (для власника, з можливістю відкату)
create table if not exists revisions (
  id bigserial primary key,
  entity text not null,                 -- person | union | family | document | photo | story | member
  entity_id text not null,
  action text not null,                 -- create | update | delete | restore
  before jsonb, after jsonb,
  by uuid, at timestamptz not null default now()
);
create index if not exists revisions_entity on revisions(entity, entity_id);
create index if not exists revisions_at on revisions(at desc);

-- Аналітика переглядів
create table if not exists events (
  id bigserial primary key,
  member_id uuid not null,
  session text,
  type text not null,                   -- login | view | open | beat | edit
  view text, target text,
  ms int not null default 0,
  at timestamptz not null default now()
);
create index if not exists events_member_at on events(member_id, at desc);
create index if not exists events_at on events(at desc);

-- Замок: RLS увімкнено, політик немає, права з публічних ролей знято
do $$ declare t text; begin
  foreach t in array array['members','invites','sessions','login_attempts','persons','unions','families','documents','photos','stories','revisions','events'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;
revoke all on all sequences in schema public from anon, authenticated;

-- Закрите сховище файлів
insert into storage.buckets (id, name, public)
values ('family', 'family', false)
on conflict (id) do update set public = false;
