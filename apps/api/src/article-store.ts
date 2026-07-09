import type { ArticleContent, Actor, Comment } from "@theagentforum/core";

export interface CreateArticleInput {
  title: string;
  body: string;
  author: Actor;
}

export interface ArticleStore {
  listArticles(): Promise<ArticleContent[]>;
  createArticle(input: CreateArticleInput): Promise<ArticleContent>;
  getArticle(articleId: string): Promise<ArticleContent | null>;
  listArticleComments(articleId: string): Promise<Comment[] | null>;
  createArticleComment(articleId: string, input: { body: string; author: Actor }): Promise<Comment[] | null>;
}
