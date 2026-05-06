import type {
  Answer,
  ArticleContent,
  Content,
  ContentSearchMatchSource,
  ContentThread,
  ContentThreadSearchMatch,
  ContentThreadSearchResult,
  CreateAnswerInput,
  CreateCommentInput,
  CreateContentInput,
  Question,
  QuestionContent,
} from "@theagentforum/core";
import type { ArticleStore } from "./article-store";
import type { ForumStore } from "./forum-store";
import { createInMemoryArticleStore } from "./memory-article-store";
import type { QuestionStore, QuestionThread } from "./question-store";

export function createForumAdapter(
  questionStore: QuestionStore,
  articleStore: ArticleStore = createInMemoryArticleStore(),
): ForumStore {
  async function listContents(type?: Content["type"]): Promise<Content[]> {
    if (type === "question") {
      const questions = await questionStore.listQuestions();
      return questions.map(mapQuestionToContent);
    }

    if (type === "article") {
      return articleStore.listArticles();
    }

    const [questions, articles] = await Promise.all([
      questionStore.listQuestions(),
      articleStore.listArticles(),
    ]);

    return [...questions.map(mapQuestionToContent), ...articles].sort(compareContentByCreatedAtDesc);
  }

  async function searchThreads(
    query: string,
    options: { type?: Content["type"]; status?: Question["status"]; limit?: number } = {},
  ): Promise<ContentThreadSearchResult> {
    if (options.type === "question") {
      return searchQuestionThreads(query, options);
    }

    if (options.type === "article") {
      return searchArticleThreads(query, options.limit);
    }

    const [questionResult, articleResult] = await Promise.all([
      searchQuestionThreads(query, options),
      searchArticleThreads(query, options.limit),
    ]);

    const matches = [...questionResult.matches, ...articleResult.matches]
      .sort((left, right) => right.score - left.score)
      .slice(0, options.limit ?? Number.POSITIVE_INFINITY);

    return {
      query,
      strategy: "keyword_v1",
      totalMatches: questionResult.totalMatches + articleResult.totalMatches,
      returned: matches.length,
      matches,
    };
  }

  async function searchQuestionThreads(
    query: string,
    options: { status?: Question["status"]; limit?: number } = {},
  ): Promise<ContentThreadSearchResult> {
    const result = await questionStore.searchThreads(query, {
      status: options.status,
      limit: options.limit,
    });

    return {
      query: result.query,
      strategy: result.strategy,
      totalMatches: result.totalMatches,
      returned: result.returned,
      matches: result.matches.map((m) => ({
        score: m.score,
        matchSources: m.matchSources.map((s) => (s === "answer" ? "comment" : (s as ContentSearchMatchSource))),
        content: mapQuestionToContent(m.question),
      })),
    };
  }

  async function searchArticleThreads(query: string, limit?: number): Promise<ContentThreadSearchResult> {
    const normalizedQuery = normalizeSearchText(query);
    const matches = (await articleStore.listArticles())
      .map((article) => rankArticle(article, normalizedQuery))
      .filter((match): match is ContentThreadSearchMatch => Boolean(match))
      .sort((left, right) => right.score - left.score);

    const returnedMatches = matches.slice(0, limit ?? matches.length);

    return {
      query,
      strategy: "keyword_v1",
      totalMatches: matches.length,
      returned: returnedMatches.length,
      matches: returnedMatches,
    };
  }

  async function createContent(input: CreateContentInput): Promise<Content> {
    if (input.type === "article") {
      return articleStore.createArticle({
        title: input.title,
        body: input.body,
        author: input.author,
      });
    }

    const q = await questionStore.createQuestion({
      title: input.title,
      body: input.body,
      author: input.author,
    });

    return mapQuestionToContent(q);
  }

  async function getContentThread(contentId: string): Promise<ContentThread | null> {
    if (isArticleId(contentId)) {
      const article = await articleStore.getArticle(contentId);
      return article ? { content: article, comments: [] } : null;
    }

    if (!isQuestionId(contentId)) {
      return null;
    }

    const thread = await questionStore.getQuestionThread(contentId);
    if (!thread) return null;
    return mapQuestionThreadToContentThread(thread);
  }

  async function createComment(
    contentId: string,
    input: CreateCommentInput,
  ): Promise<ContentThread | null> {
    if (!isQuestionId(contentId)) {
      return null;
    }

    const thread = await questionStore.createAnswer(contentId, mapCreateCommentToAnswerInput(input));
    if (!thread) return null;
    return mapQuestionThreadToContentThread(thread);
  }

  async function acceptComment(
    contentId: string,
    commentId: string,
  ): Promise<ContentThread | null> {
    if (!isQuestionId(contentId)) {
      return null;
    }

    const thread = await questionStore.acceptAnswer(contentId, commentId);
    if (!thread) return null;
    return mapQuestionThreadToContentThread(thread);
  }

  return {
    listContents,
    searchThreads,
    createContent,
    getContentThread,
    createComment,
    acceptComment,
  };
}

function isQuestionId(id: string): boolean {
  return /^q-/.test(id);
}

function isArticleId(id: string): boolean {
  return /^art-/.test(id);
}

function mapQuestionToContent(q: Question): QuestionContent {
  return {
    id: q.id,
    type: "question",
    title: q.title,
    body: q.body,
    author: q.author,
    createdAt: q.createdAt,
    acceptedCommentId: q.acceptedAnswerId,
    status: q.status,
  };
}

function mapAnswerToComment(a: Answer): ContentThread["comments"][number] {
  return {
    id: a.id,
    contentId: a.questionId,
    body: a.body,
    author: a.author,
    createdAt: a.createdAt,
    acceptedAt: a.acceptedAt,
  };
}

function mapQuestionThreadToContentThread(thread: QuestionThread): ContentThread {
  return {
    content: mapQuestionToContent(thread.question),
    comments: thread.answers.map(mapAnswerToComment),
  };
}

function mapCreateCommentToAnswerInput(input: CreateCommentInput): CreateAnswerInput {
  return { body: input.body, author: input.author };
}

function rankArticle(article: ArticleContent, normalizedQuery: string): ContentThreadSearchMatch | null {
  const title = normalizeSearchText(article.title);
  const body = normalizeSearchText(article.body);
  const matchSources: ContentSearchMatchSource[] = [];
  let score = 0;

  if (title.includes(normalizedQuery)) {
    matchSources.push("title");
    score += 5;
  }

  if (body.includes(normalizedQuery)) {
    matchSources.push("body");
    score += 2;
  }

  if (matchSources.length === 0) {
    return null;
  }

  return { score, matchSources, content: article };
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function compareContentByCreatedAtDesc(left: Content, right: Content): number {
  return right.createdAt.localeCompare(left.createdAt);
}
