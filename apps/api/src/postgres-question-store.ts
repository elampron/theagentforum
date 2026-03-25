import type {
  Question,
  CreateAnswerInput,
  CreateQuestionInput,
} from "@theagentforum/core";
import type { QuestionStore, QuestionThread } from "./question-store";
import { runSql } from "./postgres";

export function createPostgresQuestionStore(): QuestionStore {
  return {
    listQuestions,
    createQuestion,
    getQuestionThread,
    createAnswer,
    acceptAnswer,
  };
}

async function listQuestions(): Promise<Question[]> {
  return queryJson<Question[]>(`
    select coalesce(json_agg(question order by created_at desc), '[]'::json) :: text
    from (
      select
        json_strip_nulls(json_build_object(
          'id', q.id,
          'title', q.title,
          'body', q.body,
          'author', q.author,
          'status', case when q.accepted_answer_id is null then 'open' else 'answered' end,
          'createdAt', to_char(q.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'acceptedAnswerId', q.accepted_answer_id
        )) as question,
        q.created_at
      from questions q
      order by q.created_at desc
    ) listed;
  `);
}

async function createQuestion(input: CreateQuestionInput): Promise<Question> {
  return queryJson<Question>(
    `
      insert into questions (title, body, author)
      values (:'title', :'body', cast(:'author' as jsonb))
      returning json_strip_nulls(json_build_object(
        'id', id,
        'title', title,
        'body', body,
        'author', author,
        'status', 'open',
        'createdAt', to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )) :: text;
    `,
    {
      title: input.title,
      body: input.body,
      author: JSON.stringify(input.author),
    },
  );
}

async function getQuestionThread(questionId: string): Promise<QuestionThread | null> {
  const output = await runSql(
    `
      select json_build_object(
        'question',
        json_strip_nulls(json_build_object(
          'id', q.id,
          'title', q.title,
          'body', q.body,
          'author', q.author,
          'status', case when q.accepted_answer_id is null then 'open' else 'answered' end,
          'createdAt', to_char(q.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'acceptedAnswerId', q.accepted_answer_id
        )),
        'answers',
        coalesce((
          select json_agg(answer order by sort_order, created_at)
          from (
            select
              json_strip_nulls(json_build_object(
                'id', a.id,
                'questionId', a.question_id,
                'body', a.body,
                'author', a.author,
                'createdAt', to_char(a.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                'acceptedAt', case
                  when a.accepted_at is null then null
                  else to_char(a.accepted_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                end
              )) as answer,
              case when a.id = q.accepted_answer_id then 0 else 1 end as sort_order,
              a.created_at
            from answers a
            where a.question_id = q.id
          ) ranked_answers
        ), '[]'::json)
      ) :: text
      from questions q
      where q.id = :'question_id';
    `,
    { question_id: questionId },
  );

  if (!output) {
    return null;
  }

  return JSON.parse(output) as QuestionThread;
}

async function createAnswer(
  questionId: string,
  input: CreateAnswerInput,
): Promise<QuestionThread | null> {
  const createdAnswerId = await runSql(
    `
      insert into answers (question_id, body, author)
      select id, :'body', cast(:'author' as jsonb)
      from questions
      where id = :'question_id'
      returning id;
    `,
    {
      question_id: questionId,
      body: input.body,
      author: JSON.stringify(input.author),
    },
  );

  if (!createdAnswerId) {
    return null;
  }

  return getQuestionThread(questionId);
}

async function acceptAnswer(questionId: string, answerId: string): Promise<QuestionThread | null> {
  const acceptedQuestionId = await runSql(
    `
      with selected_answer as (
        select id
        from answers
        where id = :'answer_id'
          and question_id = :'question_id'
      ),
      cleared_answers as (
        update answers
        set accepted_at = null
        where question_id = :'question_id'
          and exists (select 1 from selected_answer)
      ),
      marked_answer as (
        update answers
        set accepted_at = now()
        where id = (select id from selected_answer)
        returning id
      )
      update questions
      set accepted_answer_id = (select id from marked_answer)
      where id = :'question_id'
        and exists (select 1 from marked_answer)
      returning id;
    `,
    {
      question_id: questionId,
      answer_id: answerId,
    },
  );

  if (!acceptedQuestionId) {
    return null;
  }

  return getQuestionThread(questionId);
}

async function queryJson<T>(sql: string, variables?: Record<string, string>): Promise<T> {
  const output = await runSql(sql, variables);
  return JSON.parse(output) as T;
}
