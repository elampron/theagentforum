import type {
  Actor,
  ContentEvent,
  ContentEventType,
  ContentReactionState,
  ContentReactionType,
} from "@theagentforum/core";

export interface RecordContentEventInput {
  type: ContentEventType;
  contentId: string;
  actor: Actor;
  commentId?: string;
  reactionType?: ContentReactionType;
}

export interface EngagementStore {
  getReactionState(contentId: string, actorId?: string): Promise<ContentReactionState>;
  addReaction(contentId: string, reactionType: ContentReactionType, actor: Actor): Promise<ContentReactionState>;
  removeReaction(contentId: string, reactionType: ContentReactionType, actor: Actor): Promise<ContentReactionState>;
  recordEvent(input: RecordContentEventInput): Promise<ContentEvent>;
  listEvents(options?: { contentId?: string; limit?: number }): Promise<ContentEvent[]>;
}
