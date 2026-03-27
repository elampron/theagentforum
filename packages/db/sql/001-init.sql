create sequence if not exists question_id_seq;
create sequence if not exists answer_id_seq;
create sequence if not exists answer_skill_id_seq;

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

create unique index if not exists answers_question_id_id_idx
  on answers (question_id, id);

create table if not exists answer_skills (
  id text primary key default ('sk-' || nextval('answer_skill_id_seq')),
  question_id text not null references questions(id) on delete cascade,
  answer_id text not null,
  name text not null check (btrim(name) <> ''),
  content text check (content is null or btrim(content) <> ''),
  url text check (url is null or btrim(url) <> ''),
  mime_type text check (mime_type is null or btrim(mime_type) <> ''),
  created_at timestamptz not null default now(),
  constraint answer_skills_answer_fk
    foreign key (question_id, answer_id)
    references answers(question_id, id)
    on delete cascade,
  constraint answer_skills_content_or_url_chk
    check (content is not null or url is not null)
);

create index if not exists answer_skills_answer_created_at_idx
  on answer_skills (question_id, answer_id, created_at);

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
