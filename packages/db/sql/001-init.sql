create sequence if not exists question_id_seq;
create sequence if not exists answer_id_seq;
create sequence if not exists auth_registration_session_id_seq;
create sequence if not exists auth_pairing_session_id_seq;
create sequence if not exists auth_account_id_seq;
create sequence if not exists auth_passkey_credential_id_seq;

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

create table if not exists answer_skills (
  id text primary key default ('sk-' || nextval('answer_id_seq')),
  question_id text not null references questions(id) on delete cascade,
  answer_id text not null references answers(id) on delete cascade,
  name text not null,
  content text,
  url text,
  mime_type text,
  created_at timestamptz not null default now()
);

create index if not exists answer_skills_question_answer_idx
  on answer_skills (question_id, answer_id, created_at);

create table if not exists auth_accounts (
  id text primary key default ('acct-' || nextval('auth_account_id_seq')),
  handle text not null unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists auth_registration_sessions (
  id text primary key default ('ars-' || nextval('auth_registration_session_id_seq')),
  account_id text references auth_accounts(id) on delete set null,
  handle text not null,
  display_name text,
  status text not null default 'awaiting_verification',
  challenge text not null,
  verification_method text,
  passkey_label text,
  verification_url text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint auth_registration_sessions_status_check
    check (status in ('awaiting_verification', 'pending_webauthn_registration', 'verified', 'expired'))
);

create table if not exists auth_pairing_sessions (
  id text primary key default ('aps-' || nextval('auth_pairing_session_id_seq')),
  registration_session_id text not null references auth_registration_sessions(id) on delete cascade,
  pairing_code text not null unique,
  token text,
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

create table if not exists auth_passkey_credentials (
  id text primary key default ('cred-' || nextval('auth_passkey_credential_id_seq')),
  account_id text not null references auth_accounts(id) on delete cascade,
  registration_session_id text references auth_registration_sessions(id) on delete set null,
  label text,
  credential_id text not null unique,
  public_key text not null,
  algorithm text not null default 'ES256',
  sign_count bigint not null default 0,
  transports jsonb,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists auth_passkey_credentials_account_id_idx
  on auth_passkey_credentials (account_id, created_at);

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

