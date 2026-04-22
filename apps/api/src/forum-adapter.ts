import type {
  Answer,
  AnswerSkill,
  CreateAnswerInput,
  CreateAnswerSkillInput,
  Question,
} from "@theagentforum/core";
import type {
  Comment,
  CommentSkill,
  Content,
  ContentThread,
  ContentThreadSearchResult,
  CreateCommentInput,
  CreateCommentSkillInput,
  CreateContentInput,
  QuestionContent,
} from "@theagentforum/core";
import type { ForumStore } from "./forum-store";
import type { QuestionStore, QuestionThread } from "./question-store";

export function createForumAdapter(questionStore: QuestionStore): ForumStore {
  async function listContents(type?: Content["type"]): Promise<Content[]> {
    if (!type || type === "question") {
      const questions = await questionStore.listQuestions();
      return questions.map(mapQuestionToContent);
    }

    // Articles not yet backed by storage in v2 MVP
    return [];
  }

  async function searchThreads(
    query: string,
    options: { type?: Content["type"]; status?: Question["status"]; limit?: number } = {},
  ): Promise<ContentThreadSearchResult> {
    const type = options.type ?? "question";

    if (type !== "question") {
      return emptySearchResult(query);
    }

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
        matchSources: m.matchSources.map((s) => (s === "answer" ? "comment" : (s as any))),
        content: mapQuestionToContent(m.question),
      })),
    };
  }

  async function createContent(input: CreateContentInput): Promise<Content> {
    if (input.type !== "question") {
      throw createNotImplementedError("Only type=question is supported in v2 MVP.");
    }

    const q = await questionStore.createQuestion({
      title: input.title,
      body: input.body,
      author: input.author,
    });

    return mapQuestionToContent(q);
  }

  async function getContentThread(contentId: string): Promise<ContentThread | null> {
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

  async function listCommentSkills(
    contentId: string,
    commentId: string,
  ): Promise<CommentSkill[] | null> {
    if (!isQuestionId(contentId)) {
      return null;
    }

    const skills = await questionStore.listAnswerSkills(contentId, commentId);
    if (!skills) return null;
    return skills.map(mapAnswerSkillToCommentSkill);
  }

  async function createCommentSkill(
    contentId: string,
    commentId: string,
    input: CreateCommentSkillInput,
  ): Promise<CommentSkill | null> {
    if (!isQuestionId(contentId)) {
      return null;
    }

    const skill = await questionStore.createAnswerSkill(
      contentId,
      commentId,
      mapCreateCommentSkillToAnswerSkillInput(input),
    );
    if (!skill) return null;
    return mapAnswerSkillToCommentSkill(skill);
  }

  return {
    listContents,
    searchThreads,
    createContent,
    getContentThread,
    createComment,
    acceptComment,
    listCommentSkills,
    createCommentSkill,
  };
}

function isQuestionId(id: string): boolean {
  return /^q-/.test(id);
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

function mapAnswerToComment(a: Answer): Comment {
  return {
    id: a.id,
    contentId: a.questionId,
    body: a.body,
    author: a.author,
    createdAt: a.createdAt,
    acceptedAt: a.acceptedAt,
  };
}

function mapAnswerSkillToCommentSkill(skill: AnswerSkill): CommentSkill {
  return {
    id: skill.id,
    contentId: skill.questionId,
    commentId: skill.answerId,
    name: skill.name,
    content: skill.content,
    url: skill.url,
    mimeType: skill.mimeType,
    createdAt: skill.createdAt,
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

function mapCreateCommentSkillToAnswerSkillInput(
  input: CreateCommentSkillInput,
): CreateAnswerSkillInput {
  return {
    name: input.name,
    content: input.content,
    url: input.url,
    mimeType: input.mimeType,
  };
}

function emptySearchResult(query: string): ContentThreadSearchResult {
  return { query, strategy: "keyword_v1", totalMatches: 0, returned: 0, matches: [] };
}

function createNotImplementedError(message: string): Error & { statusCode: number; code: string } {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = 501;
  error.code = "not_implemented";
  return error;
}

