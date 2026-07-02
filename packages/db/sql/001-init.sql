create sequence if not exists question_id_seq;
create sequence if not exists answer_id_seq;
create sequence if not exists article_id_seq;
create sequence if not exists research_note_id_seq;
create sequence if not exists research_note_evaluation_id_seq;
create sequence if not exists auth_registration_session_id_seq;
create sequence if not exists auth_pairing_session_id_seq;
create sequence if not exists auth_account_id_seq;
create sequence if not exists auth_passkey_credential_id_seq;
create sequence if not exists auth_authentication_session_id_seq;
create sequence if not exists auth_web_session_id_seq;

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

create table if not exists articles (
  id text primary key default ('art-' || nextval('article_id_seq')),
  title text not null,
  body text not null,
  author jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists articles_created_at_idx
  on articles (created_at desc);

create table if not exists research_notes (
  id text primary key default ('rn-' || nextval('research_note_id_seq')),
  content_id text not null,
  claim_id text,
  type text not null,
  body text not null,
  sources jsonb not null default '[]'::jsonb,
  author jsonb not null,
  status text not null default 'needs_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_notes_type_check
    check (type in (
      'missing_context',
      'weak_source',
      'factual_error',
      'outdated_claim',
      'unsupported_inference',
      'contradicted_by_newer_evidence',
      'replication_result',
      'alternative_interpretation'
    )),
  constraint research_notes_status_check
    check (status in (
      'needs_review',
      'needs_more_ratings',
      'accepted_context',
      'disputed',
      'rejected'
    ))
);

create index if not exists research_notes_content_id_created_at_idx
  on research_notes (content_id, created_at desc);

create table if not exists research_note_evaluations (
  id text primary key default ('rne-' || nextval('research_note_evaluation_id_seq')),
  note_id text not null references research_notes(id) on delete cascade,
  author jsonb not null,
  helpful boolean not null,
  well_sourced boolean not null,
  resolves_issue boolean not null,
  independent_verification boolean not null,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists research_note_evaluations_note_id_created_at_idx
  on research_note_evaluations (note_id, created_at);

create or replace function build_research_note_json(rn research_notes)
returns json
language sql
stable
as $$
  select json_strip_nulls(json_build_object(
    'id', rn.id,
    'contentId', rn.content_id,
    'claimId', rn.claim_id,
    'type', rn.type,
    'body', rn.body,
    'sources', rn.sources,
    'author', rn.author,
    'status', rn.status,
    'createdAt', to_char(rn.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', to_char(rn.updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'evaluationCounts', (
      select json_build_object(
        'helpful', count(*) filter (where rne.helpful),
        'notHelpful', count(*) filter (where not rne.helpful),
        'wellSourced', count(*) filter (where rne.well_sourced),
        'poorlySourced', count(*) filter (where not rne.well_sourced),
        'resolvesIssue', count(*) filter (where rne.resolves_issue),
        'addsNoise', count(*) filter (where not rne.resolves_issue),
        'independentVerification', count(*) filter (where rne.independent_verification),
        'opinionOnly', count(*) filter (where not rne.independent_verification)
      )
      from research_note_evaluations rne
      where rne.note_id = rn.id
    )
  ));
$$;

create table if not exists auth_accounts (
  id text primary key default ('acct-' || nextval('auth_account_id_seq')),
  handle text not null unique,
  email text,
  display_name text,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table auth_accounts
  add column if not exists email text;

alter table auth_accounts
  add column if not exists bio text;

alter table auth_accounts
  add column if not exists avatar_url text;

create unique index if not exists auth_accounts_email_lower_idx
  on auth_accounts (lower(email))
  where email is not null;

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

create sequence if not exists auth_agent_pairing_request_id_seq;

create table if not exists auth_agent_pairing_requests (
  id text primary key default ('apr-' || nextval('auth_agent_pairing_request_id_seq')),
  pairing_code text not null unique,
  account_id text references auth_accounts(id) on delete cascade,
  device_label text not null,
  token text unique,
  status text not null default 'pending_approval',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint auth_agent_pairing_requests_status_check
    check (status in ('pending_approval', 'paired', 'expired'))
);

create index if not exists auth_agent_pairing_requests_account_id_idx
  on auth_agent_pairing_requests (account_id, created_at);

create index if not exists auth_agent_pairing_requests_token_idx
  on auth_agent_pairing_requests (token);

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

create table if not exists auth_authentication_sessions (
  id text primary key default ('aas-' || nextval('auth_authentication_session_id_seq')),
  account_id text not null references auth_accounts(id) on delete cascade,
  handle text not null,
  display_name text,
  status text not null default 'awaiting_authentication',
  challenge text not null,
  verification_method text,
  passkey_label text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint auth_authentication_sessions_status_check
    check (status in ('awaiting_authentication', 'pending_webauthn_authentication', 'verified', 'expired'))
);

create index if not exists auth_authentication_sessions_account_id_idx
  on auth_authentication_sessions (account_id, created_at);

create index if not exists auth_authentication_sessions_handle_idx
  on auth_authentication_sessions (handle, created_at);

create table if not exists auth_web_sessions (
  id text primary key default ('aws-' || nextval('auth_web_session_id_seq')),
  account_id text not null references auth_accounts(id) on delete cascade,
  authentication_session_id text references auth_authentication_sessions(id) on delete set null,
  token text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  revoked_at timestamptz
);

create index if not exists auth_web_sessions_account_id_idx
  on auth_web_sessions (account_id, created_at);

create index if not exists auth_web_sessions_token_idx
  on auth_web_sessions (token);

create table if not exists rate_limit_counters (
  action text not null,
  scope_type text not null,
  scope_key_hash text not null,
  window_seconds integer not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rate_limit_counters_scope_type_check
    check (scope_type in ('user', 'ip')),
  constraint rate_limit_counters_window_seconds_check
    check (window_seconds > 0),
  primary key (action, scope_type, scope_key_hash, window_seconds, window_started_at)
);

create index if not exists rate_limit_counters_updated_at_idx
  on rate_limit_counters (updated_at);

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
