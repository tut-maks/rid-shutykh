-- Самостійна реєстрація родичів за посиланням: заявка → Максим перевіряє, прив'язує до картки в дереві → доступ.
-- Доки заявку не прийнято, людина нічого не бачить. Пише й читає лише сервер.
create table if not exists join_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null default '',
  pass_hash text not null,               -- scrypt; після прийняття переноситься в members
  data jsonb not null default '{}',      -- про себе й рідних: батьки, діди, діти, брати й сестри…
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  ip text, ua text,
  created_at timestamptz not null default now(),
  decided_by uuid, decided_at timestamptz,
  member_id uuid,
  person_id text
);
create index if not exists join_requests_status on join_requests(status, created_at desc);
create index if not exists join_requests_email on join_requests(email);

-- Налаштування (код посилання для реєстрації тощо)
create table if not exists settings (
  key text primary key,
  value jsonb not null default '{}',
  updated_by uuid,
  updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['join_requests','settings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;
