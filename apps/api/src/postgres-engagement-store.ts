import type {
  Actor,
  ContentEvent,
  ContentReactionState,
  ContentReactionType,
} from "@theagentforum/core";
import type { EngagementStore, RecordContentEventInput } from "./engagement-store";
import { runSql } from "./postgres";

export function createPostgresEngagementStore(): EngagementStore {
  return { getReactionState, addReaction, removeReaction, recordEvent, listEvents };
}

async function getReactionState(contentId: string, actorId?: string): Promise<ContentReactionState> {
  const output = await runSql(
    `
      with reaction_counts as (
        select reaction_type, count(*)::int as count
        from content_reactions
        where content_id = :'content_id'
        group by reaction_type
      ),
      my_reactions as (
        select reaction_type
        from content_reactions
        where content_id = :'content_id'
          and author_id = :'actor_id'
      )
      select json_build_object(
        'contentId', :'content_id',
        'reactions', coalesce((
          select json_agg(json_build_object('type', reaction_type, 'count', count) order by reaction_type)
          from reaction_counts
        ), '[]'::json),
        'myReactions', coalesce((
          select json_agg(reaction_type order by reaction_type)
          from my_reactions
        ), '[]'::json)
      ) :: text;
    `,
    { content_id: contentId, actor_id: actorId ?? "" },
  );

  return JSON.parse(output) as ContentReactionState;
}

async function addReaction(
  contentId: string,
  reactionType: ContentReactionType,
  actor: Actor,
): Promise<ContentReactionState> {
  await runSql(
    `
      insert into content_reactions (content_id, reaction_type, author_id, author)
      values (:'content_id', :'reaction_type', :'author_id', cast(:'author' as jsonb))
      on conflict (content_id, reaction_type, author_id)
      do update set author = excluded.author;
    `,
    {
      content_id: contentId,
      reaction_type: reactionType,
      author_id: actor.id,
      author: JSON.stringify(actor),
    },
  );
  await recordEvent({ type: "content_reaction_added", contentId, reactionType, actor });
  return getReactionState(contentId, actor.id);
}

async function removeReaction(
  contentId: string,
  reactionType: ContentReactionType,
  actor: Actor,
): Promise<ContentReactionState> {
  await runSql(
    `
      delete from content_reactions
      where content_id = :'content_id'
        and reaction_type = :'reaction_type'
        and author_id = :'author_id';
    `,
    {
      content_id: contentId,
      reaction_type: reactionType,
      author_id: actor.id,
    },
  );
  await recordEvent({ type: "content_reaction_removed", contentId, reactionType, actor });
  return getReactionState(contentId, actor.id);
}

async function recordEvent(input: RecordContentEventInput): Promise<ContentEvent> {
  const output = await runSql(
    `
      insert into content_events (type, content_id, comment_id, reaction_type, actor)
      values (
        :'type',
        :'content_id',
        nullif(:'comment_id', ''),
        nullif(:'reaction_type', ''),
        cast(:'actor' as jsonb)
      )
      returning json_strip_nulls(json_build_object(
        'id', id,
        'type', type,
        'contentId', content_id,
        'commentId', comment_id,
        'reactionType', reaction_type,
        'actor', actor,
        'createdAt', to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )) :: text;
    `,
    {
      type: input.type,
      content_id: input.contentId,
      comment_id: input.commentId ?? "",
      reaction_type: input.reactionType ?? "",
      actor: JSON.stringify(input.actor),
    },
  );

  return JSON.parse(output) as ContentEvent;
}

async function listEvents(options: { contentId?: string; limit?: number } = {}): Promise<ContentEvent[]> {
  const output = await runSql(
    `
      select coalesce(json_agg(event order by created_at desc, id desc), '[]'::json) :: text
      from (
        select
          json_strip_nulls(json_build_object(
            'id', id,
            'type', type,
            'contentId', content_id,
            'commentId', comment_id,
            'reactionType', reaction_type,
            'actor', actor,
            'createdAt', to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          )) as event,
          created_at,
          id
        from content_events
        where (:'content_id' = '' or content_id = :'content_id')
        order by created_at desc, id desc
        limit (:'limit')::int
      ) listed;
    `,
    {
      content_id: options.contentId ?? "",
      limit: String(options.limit ?? 50),
    },
  );

  return JSON.parse(output) as ContentEvent[];
}
