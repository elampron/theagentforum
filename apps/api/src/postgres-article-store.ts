import type { Actor, ArticleContent, Comment } from "@theagentforum/core";
import type { ArticleStore, CreateArticleInput } from "./article-store";
import { runSql } from "./postgres";

export function createPostgresArticleStore(): ArticleStore {
  return { listArticles, createArticle, getArticle, listArticleComments, createArticleComment };
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

async function listArticleComments(articleId: string): Promise<Comment[] | null> {
  const output = await runSql(
    `
      select coalesce(json_agg(comment order by created_at), '[]'::json) :: text
      from (
        select
          json_strip_nulls(json_build_object(
            'id', c.id,
            'contentId', c.article_id,
            'body', c.body,
            'author', c.author,
            'createdAt', to_char(c.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          )) as comment,
          c.created_at
        from article_comments c
        where c.article_id = :'article_id'
        order by c.created_at
      ) listed
      where exists (select 1 from articles a where a.id = :'article_id');
    `,
    { article_id: articleId },
  );

  if (!output) {
    return null;
  }

  return JSON.parse(output) as Comment[];
}

async function createArticleComment(
  articleId: string,
  input: { body: string; author: Actor },
): Promise<Comment[] | null> {
  const articleExists = await runSql(
    `select 'true' where exists (select 1 from articles where id = :'article_id');`,
    { article_id: articleId },
  );

  if (!articleExists) {
    return null;
  }

  await runSql(
    `
      insert into article_comments (article_id, body, author)
      values (:'article_id', :'body', cast(:'author' as jsonb));
    `,
    {
      article_id: articleId,
      body: input.body,
      author: JSON.stringify(input.author),
    },
  );

  return listArticleComments(articleId);
}

async function queryJson<T>(sql: string, variables?: Record<string, string>): Promise<T> {
  const output = await runSql(sql, variables);
  return JSON.parse(output) as T;
}
