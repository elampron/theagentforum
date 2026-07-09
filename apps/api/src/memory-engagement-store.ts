import type {
  Actor,
  ContentEvent,
  ContentReactionState,
  ContentReactionSummary,
  ContentReactionType,
} from "@theagentforum/core";
import type { EngagementStore, RecordContentEventInput } from "./engagement-store";

interface StoredReaction {
  contentId: string;
  reactionType: ContentReactionType;
  author: Actor;
  createdAt: string;
}

export function createInMemoryEngagementStore(): EngagementStore {
  const reactions = new Map<string, StoredReaction>();
  const events: ContentEvent[] = [];
  let eventSequence = 1;

  async function getReactionState(contentId: string, actorId?: string): Promise<ContentReactionState> {
    return buildReactionState(contentId, actorId);
  }

  async function addReaction(
    contentId: string,
    reactionType: ContentReactionType,
    actor: Actor,
  ): Promise<ContentReactionState> {
    reactions.set(reactionKey(contentId, reactionType, actor.id), {
      contentId,
      reactionType,
      author: actor,
      createdAt: new Date().toISOString(),
    });
    await recordEvent({ type: "content_reaction_added", contentId, reactionType, actor });
    return buildReactionState(contentId, actor.id);
  }

  async function removeReaction(
    contentId: string,
    reactionType: ContentReactionType,
    actor: Actor,
  ): Promise<ContentReactionState> {
    reactions.delete(reactionKey(contentId, reactionType, actor.id));
    await recordEvent({ type: "content_reaction_removed", contentId, reactionType, actor });
    return buildReactionState(contentId, actor.id);
  }

  async function recordEvent(input: RecordContentEventInput): Promise<ContentEvent> {
    const event: ContentEvent = {
      id: `ce-${eventSequence++}`,
      type: input.type,
      contentId: input.contentId,
      commentId: input.commentId,
      reactionType: input.reactionType,
      actor: { ...input.actor },
      createdAt: new Date().toISOString(),
    };
    events.unshift(event);
    return cloneEvent(event);
  }

  async function listEvents(options: { contentId?: string; limit?: number } = {}): Promise<ContentEvent[]> {
    return events
      .filter((event) => !options.contentId || event.contentId === options.contentId)
      .slice(0, options.limit ?? 50)
      .map(cloneEvent);
  }

  function buildReactionState(contentId: string, actorId?: string): ContentReactionState {
    const matching = Array.from(reactions.values()).filter((reaction) => reaction.contentId === contentId);
    const summaries = new Map<ContentReactionType, number>();
    const myReactions = new Set<ContentReactionType>();

    for (const reaction of matching) {
      summaries.set(reaction.reactionType, (summaries.get(reaction.reactionType) ?? 0) + 1);
      if (actorId && reaction.author.id === actorId) {
        myReactions.add(reaction.reactionType);
      }
    }

    return {
      contentId,
      reactions: Array.from(summaries.entries()).map(([type, count]): ContentReactionSummary => ({ type, count })),
      myReactions: Array.from(myReactions),
    };
  }

  return { getReactionState, addReaction, removeReaction, recordEvent, listEvents };
}

function reactionKey(contentId: string, reactionType: ContentReactionType, authorId: string): string {
  return `${contentId}:${reactionType}:${authorId}`;
}

function cloneEvent(event: ContentEvent): ContentEvent {
  return {
    ...event,
    actor: { ...event.actor },
  };
}
