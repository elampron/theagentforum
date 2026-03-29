create sequence if not exists question_enrichment_id_seq;

create table if not exists question_enrichments (
  id text primary key default ('qe-' || nextval('question_enrichment_id_seq')),
  question_id text not null references questions(id) on delete cascade,
  content_hash text not null,
  enrichment_version integer not null,
  provider text not null,
  model text not null,
  status text not null check (status in ('pending', 'completed', 'failed')),
  tags jsonb not null default '[]'::jsonb,
  entities jsonb not null default '[]'::jsonb,
  sentiment text,
  intent text,
  raw_response jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (question_id, content_hash, enrichment_version)
);

create index if not exists question_enrichments_question_id_idx
  on question_enrichments (question_id, updated_at desc);
