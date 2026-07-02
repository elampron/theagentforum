import type {
  EvaluateResearchNoteInput,
  ResearchNote,
  ResearchNoteEvaluation,
  CreateResearchNoteInput,
} from "@theagentforum/core";
import { runSql } from "./postgres";
import type { ResearchNoteStore } from "./research-note-store";

export function createPostgresResearchNoteStore(): ResearchNoteStore {
  return { listNotesForContent, createNote, evaluateNote, listEvaluations };
}

async function listNotesForContent(contentId: string): Promise<ResearchNote[]> {
  return queryJson<ResearchNote[]>(
    `
      select coalesce(json_agg(note order by helpful_score desc, created_at desc), '[]'::json) :: text
      from (
        select
          build_research_note_json(rn.*) as note,
          (
            select count(*) filter (where helpful) - count(*) filter (where not helpful)
            from research_note_evaluations rne
            where rne.note_id = rn.id
          ) as helpful_score,
          rn.created_at
        from research_notes rn
        where rn.content_id = :'content_id'
      ) listed;
    `,
    { content_id: contentId },
  );
}

async function createNote(contentId: string, input: CreateResearchNoteInput): Promise<ResearchNote> {
  return queryJson<ResearchNote>(
    `
      insert into research_notes (content_id, claim_id, type, body, sources, author)
      values (
        :'content_id',
        nullif(:'claim_id', ''),
        :'type',
        :'body',
        cast(:'sources' as jsonb),
        cast(:'author' as jsonb)
      )
      returning build_research_note_json(research_notes.*) :: text;
    `,
    {
      content_id: contentId,
      claim_id: input.claimId ?? "",
      type: input.type,
      body: input.body,
      sources: JSON.stringify(input.sources ?? []),
      author: JSON.stringify(input.author),
    },
  );
}

async function evaluateNote(noteId: string, input: EvaluateResearchNoteInput): Promise<ResearchNote | null> {
  const output = await runSql(
    `
      with target as (
        select id
        from research_notes
        where id = :'note_id'
      ),
      inserted as (
        insert into research_note_evaluations (
          note_id,
          author,
          helpful,
          well_sourced,
          resolves_issue,
          independent_verification,
          comment
        )
        select
          id,
          cast(:'author' as jsonb),
          :'helpful'::boolean,
          :'well_sourced'::boolean,
          :'resolves_issue'::boolean,
          :'independent_verification'::boolean,
          nullif(:'comment', '')
        from target
        returning note_id, created_at
      ),
      aggregate as (
        select
          rn.id,
          count(rne.*) as total,
          count(*) filter (where rne.helpful) as helpful_count,
          count(*) filter (where not rne.helpful) as not_helpful_count
        from research_notes rn
        join inserted i on i.note_id = rn.id
        left join research_note_evaluations rne on rne.note_id = rn.id
        group by rn.id
      ),
      updated as (
        update research_notes rn
        set
          status = case
            when a.total < 2 then 'needs_more_ratings'
            when a.helpful_count >= 2 and a.helpful_count > a.not_helpful_count then 'accepted_context'
            when a.not_helpful_count >= 2 and a.not_helpful_count > a.helpful_count then 'rejected'
            else 'disputed'
          end,
          updated_at = (select max(created_at) from inserted)
        from aggregate a
        where rn.id = a.id
        returning rn.*
      )
      select build_research_note_json(updated.*) :: text
      from updated;
    `,
    {
      note_id: noteId,
      author: JSON.stringify(input.author),
      helpful: String(input.helpful),
      well_sourced: String(input.wellSourced),
      resolves_issue: String(input.resolvesIssue),
      independent_verification: String(input.independentVerification),
      comment: input.comment ?? "",
    },
  );

  return output ? JSON.parse(output) as ResearchNote : null;
}

async function listEvaluations(noteId: string): Promise<ResearchNoteEvaluation[] | null> {
  const exists = await runSql("select id from research_notes where id = :'note_id';", { note_id: noteId });

  if (!exists) {
    return null;
  }

  return queryJson<ResearchNoteEvaluation[]>(
    `
      select coalesce(json_agg(evaluation order by created_at), '[]'::json) :: text
      from (
        select json_strip_nulls(json_build_object(
          'id', id,
          'noteId', note_id,
          'author', author,
          'helpful', helpful,
          'wellSourced', well_sourced,
          'resolvesIssue', resolves_issue,
          'independentVerification', independent_verification,
          'comment', comment,
          'createdAt', to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )) as evaluation,
        created_at
        from research_note_evaluations
        where note_id = :'note_id'
      ) listed;
    `,
    { note_id: noteId },
  );
}

async function queryJson<T>(sql: string, variables?: Record<string, string>): Promise<T> {
  const output = await runSql(sql, variables);
  return JSON.parse(output) as T;
}
