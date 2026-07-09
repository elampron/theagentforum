import type { Actor, ArticleContent, Comment } from "@theagentforum/core";
import type { ArticleStore, CreateArticleInput } from "./article-store";

export function createInMemoryArticleStore(): ArticleStore {
  const articles = new Map<string, ArticleContent>();
  const comments = new Map<string, Comment[]>();
  let articleSequence = 1;
  let commentSequence = 1;

  async function listArticles(): Promise<ArticleContent[]> {
    return Array.from(articles.values()).sort(compareByCreatedAtDesc).map(cloneArticle);
  }

  async function createArticle(input: CreateArticleInput): Promise<ArticleContent> {
    const article: ArticleContent = {
      id: `art-${articleSequence++}`,
      type: "article",
      title: input.title,
      body: input.body,
      author: input.author,
      createdAt: new Date().toISOString(),
    };

    articles.set(article.id, article);
    comments.set(article.id, []);
    return cloneArticle(article);
  }

  async function getArticle(articleId: string): Promise<ArticleContent | null> {
    const article = articles.get(articleId);
    return article ? cloneArticle(article) : null;
  }

  async function listArticleComments(articleId: string): Promise<Comment[] | null> {
    if (!articles.has(articleId)) {
      return null;
    }

    return (comments.get(articleId) ?? []).map(cloneComment);
  }

  async function createArticleComment(
    articleId: string,
    input: { body: string; author: Actor },
  ): Promise<Comment[] | null> {
    if (!articles.has(articleId)) {
      return null;
    }

    const comment: Comment = {
      id: `ac-${commentSequence++}`,
      contentId: articleId,
      body: input.body,
      author: input.author,
      createdAt: new Date().toISOString(),
    };

    const nextComments = [...(comments.get(articleId) ?? []), comment];
    comments.set(articleId, nextComments);
    return nextComments.map(cloneComment);
  }

  return { listArticles, createArticle, getArticle, listArticleComments, createArticleComment };
}

function cloneArticle(article: ArticleContent): ArticleContent {
  return {
    ...article,
    author: { ...article.author },
  };
}

function cloneComment(comment: Comment): Comment {
  return {
    ...comment,
    author: { ...comment.author },
  };
}

function compareByCreatedAtDesc(left: ArticleContent, right: ArticleContent): number {
  return right.createdAt.localeCompare(left.createdAt);
}
