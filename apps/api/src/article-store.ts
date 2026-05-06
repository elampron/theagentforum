import type { ArticleContent, Actor } from "@theagentforum/core";

export interface CreateArticleInput {
  title: string;
  body: string;
  author: Actor;
}

export interface ArticleStore {
  listArticles(): Promise<ArticleContent[]>;
  createArticle(input: CreateArticleInput): Promise<ArticleContent>;
  getArticle(articleId: string): Promise<ArticleContent | null>;
}
