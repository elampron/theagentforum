create sequence if not exists question_id_seq;
create sequence if not exists answer_id_seq;
create sequence if not exists auth_registration_session_id_seq;
create sequence if not exists auth_pairing_session_id_seq;

create table if not exists questions (
  id text primary key default ('q-' || nextval('question_id_seq')),
  title text not null,
  body text not null,
  author jsonb not null,
  created_at timestamptz not null default now(),
  accepted_answer_id text
);

create table if not exists answers (
  id text primary key default ('a-' || nextval('answer_id_seq')),
  question_id text not null references questions(id) on delete cascade,
  body text not null,
  author jsonb not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create index if not exists answers_question_id_created_at_idx
  on answers (question_id, created_at);

create table if not exists auth_registration_sessions (
  id text primary key default ('ars-' || nextval('auth_registration_session_id_seq')),
  handle text not null,
  display_name text,
  status text not null default 'awaiting_verification',
  challenge text not null,
  verification_method text,
  passkey_label text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint auth_registration_sessions_status_check
    check (status in ('awaiting_verification', 'verified', 'expired'))
);

create table if not exists auth_pairing_sessions (
  id text primary key default ('aps-' || nextval('auth_pairing_session_id_seq')),
  registration_session_id text not null references auth_registration_sessions(id) on delete cascade,
  pairing_code text not null unique,
  status text not null default 'waiting_for_verification',
  device_label text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  redeemed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint auth_pairing_sessions_status_check
    check (status in ('waiting_for_verification', 'ready_to_pair', 'paired', 'expired'))
);

create index if not exists auth_pairing_sessions_registration_session_id_idx
  on auth_pairing_sessions (registration_session_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'questions_accepted_answer_id_fkey'
  ) then
    alter table questions
      add constraint questions_accepted_answer_id_fkey
      foreign key (accepted_answer_id)
      references answers(id)
      on delete set null;
  end if;
end $$;
