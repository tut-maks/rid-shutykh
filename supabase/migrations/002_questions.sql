-- Запитання й уточнення від родичів: «тут помилка», «що відомо про…», «шукаю людину».
-- Бачать: автор — свої, власник і редактори — усі. Пише лише сервер.
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('fix','ask','find')),  -- уточнення | питання | знайти людину
  person_id text,                        -- про кого (якщо людина вже є в дереві)
  about text not null default '',        -- кого шукаємо (якщо людини ще немає)
  text text not null,
  status text not null default 'new' check (status in ('new','work','found','closed')),
  answer text not null default '',
  deleted boolean not null default false,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create index if not exists questions_by on questions(created_by);
create index if not exists questions_status on questions(status, created_at desc);

alter table questions enable row level security;
alter table questions force row level security;
revoke all on questions from anon, authenticated;
