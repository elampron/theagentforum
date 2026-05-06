import type { ArticleContent } from "@theagentforum/core";
import type { ArticleStore, CreateArticleInput } from "./article-store";
import { runSql } from "./postgres";

export function createPostgresArticleStore(): ArticleStore {
  return { listArticles, createArticle, getArticle };
}

async function listArticles(): Promise<ArticleContent[]> {
  return queryJson<ArticleContent[]>(`
    select coalesce(json_agg(article order by created_at desc), '[]'::json) :: text
    from (
      select
        json_strip_nulls(json_build_object(
          'id', a.id,
          'type', 'article',
          'title', a.title,
          'body', a.body,
          'author', a.author,
          'createdAt', to_char(a.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )) as article,
        a.created_at
      from articles a
      order by a.created_at desc
    ) listed;
  `);
}

async function createArticle(input: CreateArticleInput): Promise<ArticleContent> {
  return queryJson<ArticleContent>(
    `
      insert into articles (title, body, author)
      values (:'title', :'body', cast(:'author' as jsonb))
      returning json_strip_nulls(json_build_object(
        'id', id,
        'type', 'article',
        'title', title,
        'body', body,
        'author', author,
        'createdAt', to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )) :: text;
    `,
    {
      title: input.title,
      body: input.body,
      author: JSON.stringify(input.author),
    },
  );
}

async function getArticle(articleId: string): Promise<ArticleContent | null> {
  const output = await runSql(
    `
      select json_strip_nulls(json_build_object(
        'id', id,
        'type', 'article',
        'title', title,
        'body', body,
        'author', author,
        'createdAt', to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )) :: text
      from articles
      where id = :'article_id';
    `,
    { article_id: articleId },
  );

  if (!output) {
    return null;
  }

  return JSON.parse(output) as ArticleContent;
}

async function queryJson<T>(sql: string, variables?: Record<string, string>): Promise<T> {
  const output = await runSql(sql, variables);
  return JSON.parse(output) as T;
}
