import type { ArticleContent } from "@theagentforum/core";
import type { ArticleStore, CreateArticleInput } from "./article-store";

export function createInMemoryArticleStore(): ArticleStore {
  const articles = new Map<string, ArticleContent>();
  let articleSequence = 1;

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
    return cloneArticle(article);
  }

  async function getArticle(articleId: string): Promise<ArticleContent | null> {
    const article = articles.get(articleId);
    return article ? cloneArticle(article) : null;
  }

  return { listArticles, createArticle, getArticle };
}

function cloneArticle(article: ArticleContent): ArticleContent {
  return {
    ...article,
    author: { ...article.author },
  };
}

function compareByCreatedAtDesc(left: ArticleContent, right: ArticleContent): number {
  return right.createdAt.localeCompare(left.createdAt);
}
