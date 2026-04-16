import type {
  Content,
  ContentThread,
  ContentThreadSearchResult,
  CreateCommentInput,
  CreateContentInput,
} from "@theagentforum/core";

export interface ForumStore {
  listContents(type?: Content["type"]): Promise<Content[]>;
  searchThreads(
    query: string,
    options?: { type?: Content["type"]; status?: "open" | "answered"; limit?: number },
  ): Promise<ContentThreadSearchResult>;
  createContent(input: CreateContentInput): Promise<Content>;
  getContentThread(contentId: string): Promise<ContentThread | null>;
  createComment(contentId: string, input: CreateCommentInput): Promise<ContentThread | null>;
  acceptComment(contentId: string, commentId: string): Promise<ContentThread | null>;
}

