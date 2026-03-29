import type { Question } from "@theagentforum/core";
import { runSql } from "../postgres";
import type { QuestionEnrichmentPayload, StoredQuestionEnrichment } from "./types";

export async function getQuestionForEnrichment(questionId: string): Promise<Question | null> {
  const output = await runSql(
    `
      select json_strip_nulls(json_build_object(
        'id', id,
        'title', title,
        'body', body,
        'author', author,
        'status', case when accepted_answer_id is null then 'open' else 'answered' end,
        'createdAt', to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'acceptedAnswerId', accepted_answer_id
      )) :: text
      from questions
      where id = :'question_id';
    `,
    { question_id: questionId },
  );

  return output ? (JSON.parse(output) as Question) : null;
}

export async function upsertPendingEnrichment(input: {
  questionId: string;
  contentHash: string;
  enrichmentVersion: number;
  provider: string;
  model: string;
}): Promise<void> {
  await runSql(
    `
      insert into question_enrichments (
        question_id,
        content_hash,
        enrichment_version,
        provider,
        model,
        status
      ) values (
        :'question_id',
        :'content_hash',
        :'enrichment_version',
        :'provider',
        :'model',
        'pending'
      )
      on conflict (question_id, content_hash, enrichment_version)
      do update set
        provider = excluded.provider,
        model = excluded.model,
        status = 'pending',
        error = null,
        updated_at = now();
    `,
    {
      question_id: input.questionId,
      content_hash: input.contentHash,
      enrichment_version: String(input.enrichmentVersion),
      provider: input.provider,
      model: input.model,
    },
  );
}

export async function saveCompletedEnrichment(input: {
  questionId: string;
  contentHash: string;
  enrichmentVersion: number;
  provider: string;
  model: string;
  payload: QuestionEnrichmentPayload;
  rawResponse: unknown;
}): Promise<void> {
  await runSql(
    `
      update question_enrichments
      set
        status = 'completed',
        provider = :'provider',
        model = :'model',
        tags = cast(:'tags' as jsonb),
        entities = cast(:'entities' as jsonb),
        sentiment = :'sentiment',
        intent = :'intent',
        raw_response = cast(:'raw_response' as jsonb),
        error = null,
        updated_at = now(),
        completed_at = now()
      where question_id = :'question_id'
        and content_hash = :'content_hash'
        and enrichment_version = :'enrichment_version';
    `,
    {
      question_id: input.questionId,
      content_hash: input.contentHash,
      enrichment_version: String(input.enrichmentVersion),
      provider: input.provider,
      model: input.model,
      tags: JSON.stringify(input.payload.tags),
      entities: JSON.stringify(input.payload.entities),
      sentiment: input.payload.sentiment,
      intent: input.payload.intent,
      raw_response: JSON.stringify(input.rawResponse),
    },
  );
}

export async function saveFailedEnrichment(input: {
  questionId: string;
  contentHash: string;
  enrichmentVersion: number;
  error: string;
}): Promise<void> {
  await runSql(
    `
      update question_enrichments
      set
        status = 'failed',
        error = :'error',
        updated_at = now()
      where question_id = :'question_id'
        and content_hash = :'content_hash'
        and enrichment_version = :'enrichment_version';
    `,
    {
      question_id: input.questionId,
      content_hash: input.contentHash,
      enrichment_version: String(input.enrichmentVersion),
      error: input.error,
    },
  );
}

export async function getLatestQuestionEnrichment(
  questionId: string,
): Promise<StoredQuestionEnrichment | null> {
  const output = await runSql(
    `
      select json_strip_nulls(json_build_object(
        'id', id,
        'questionId', question_id,
        'contentHash', content_hash,
        'enrichmentVersion', enrichment_version,
        'provider', provider,
        'model', model,
        'status', status,
        'tags', tags,
        'entities', entities,
        'sentiment', sentiment,
        'intent', intent,
        'rawResponse', raw_response,
        'error', error,
        'createdAt', to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'updatedAt', to_char(updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'completedAt', case
          when completed_at is null then null
          else to_char(completed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        end
      )) :: text
      from question_enrichments
      where question_id = :'question_id'
      order by updated_at desc
      limit 1;
    `,
    { question_id: questionId },
  );

  return output ? (JSON.parse(output) as StoredQuestionEnrichment) : null;
}

export async function listLatestFailedEnrichmentQuestionIds(input: {
  enrichmentVersion: number;
  limit: number;
}): Promise<string[]> {
  const output = await runSql(
    `
      with latest as (
        select distinct on (question_id)
          question_id,
          status,
          updated_at
        from question_enrichments
        where enrichment_version = :'enrichment_version'
        order by question_id, updated_at desc
      )
      select coalesce(json_agg(question_id order by updated_at asc), '[]'::json)::text
      from (
        select question_id, updated_at
        from latest
        where status = 'failed'
        order by updated_at asc
        limit :'limit'
      ) failed_latest;
    `,
    {
      enrichment_version: String(input.enrichmentVersion),
      limit: String(input.limit),
    },
  );

  return output ? (JSON.parse(output) as string[]) : [];
}
