import type {
  Answer,
  Question,
  SearchMatchSource,
  ThreadSearchMatch,
  ThreadSearchResult,
} from "@theagentforum/core";

export interface SearchableThread {
  question: Question;
  answers: Pick<Answer, "body">[];
}

export interface SearchThreadsOptions {
  status?: Question["status"];
  limit?: number;
}

const DEFAULT_LIMIT = 10;

export function rankThreads(
  threads: SearchableThread[],
  query: string,
  options: SearchThreadsOptions = {},
): ThreadSearchResult {
  const normalizedQuery = normalizeSearchText(query);
  const terms = normalizedQuery.split(/\s+/g).filter(Boolean);
  const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT);

  const ranked = threads
    .filter((thread) => (options.status ? thread.question.status === options.status : true))
    .map((thread) => scoreThread(thread, normalizedQuery, terms))
    .filter((match): match is ThreadSearchMatch => match !== null)
    .sort(compareMatches);

  const matches = ranked.slice(0, limit).map(cloneMatch);

  return {
    query,
    strategy: "keyword_v1",
    totalMatches: ranked.length,
    returned: matches.length,
    matches,
  };
}

function scoreThread(
  thread: SearchableThread,
  normalizedQuery: string,
  terms: string[],
): ThreadSearchMatch | null {
  if (!normalizedQuery) {
    return null;
  }

  const title = normalizeSearchText(thread.question.title);
  const body = normalizeSearchText(thread.question.body);
  const answerBodies = thread.answers.map((answer) => normalizeSearchText(answer.body));
  const matchSources = new Set<SearchMatchSource>();
  let score = 0;

  if (title.includes(normalizedQuery)) {
    score += 120;
    matchSources.add("title");
  }

  if (body.includes(normalizedQuery)) {
    score += 80;
    matchSources.add("body");
  }

  if (answerBodies.some((answerBody) => answerBody.includes(normalizedQuery))) {
    score += 55;
    matchSources.add("answer");
  }

  for (const term of terms) {
    if (title.includes(term)) {
      score += 22;
      matchSources.add("title");
    } else if (hasFuzzyWordMatch(title, term)) {
      score += 12;
      matchSources.add("title");
    }

    if (body.includes(term)) {
      score += 10;
      matchSources.add("body");
    } else if (hasFuzzyWordMatch(body, term)) {
      score += 5;
      matchSources.add("body");
    }

    if (answerBodies.some((answerBody) => answerBody.includes(term))) {
      score += 6;
      matchSources.add("answer");
    } else if (answerBodies.some((answerBody) => hasFuzzyWordMatch(answerBody, term))) {
      score += 3;
      matchSources.add("answer");
    }
  }

  if (score <= 0) {
    return null;
  }

  if (thread.question.acceptedAnswerId) {
    score += 4;
  } else if (thread.answers.length > 0) {
    score += 2;
  }

  return {
    score,
    matchSources: Array.from(matchSources),
    question: cloneQuestion(thread.question),
  };
}

function compareMatches(left: ThreadSearchMatch, right: ThreadSearchMatch): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  const answeredBias =
    Number(Boolean(right.question.acceptedAnswerId)) - Number(Boolean(left.question.acceptedAnswerId));

  if (answeredBias !== 0) {
    return answeredBias;
  }

  if (left.question.status !== right.question.status) {
    return left.question.status === "answered" ? -1 : 1;
  }

  const createdAtOrder = right.question.createdAt.localeCompare(left.question.createdAt);

  if (createdAtOrder !== 0) {
    return createdAtOrder;
  }

  return left.question.id.localeCompare(right.question.id);
}

function hasFuzzyWordMatch(haystack: string, term: string): boolean {
  if (term.length < 4) {
    return false;
  }

  const words = haystack.split(/[^a-z0-9]+/g).filter(Boolean);

  return words.some((word) => levenshteinDistance(word, term) <= fuzzyDistanceThreshold(term));
}

function fuzzyDistanceThreshold(term: string): number {
  return term.length >= 8 ? 2 : 1;
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const previous = new Array<number>(right.length + 1);
  const current = new Array<number>(right.length + 1);

  for (let index = 0; index <= right.length; index += 1) {
    previous[index] = index;
  }

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    current[0] = leftIndex + 1;

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex] === right[rightIndex] ? 0 : 1;
      current[rightIndex + 1] = Math.min(
        current[rightIndex] + 1,
        previous[rightIndex + 1] + 1,
        previous[rightIndex] + substitutionCost,
      );
    }

    for (let index = 0; index <= right.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function cloneMatch(match: ThreadSearchMatch): ThreadSearchMatch {
  return {
    score: match.score,
    matchSources: [...match.matchSources],
    question: cloneQuestion(match.question),
  };
}

function cloneQuestion(question: Question): Question {
  return {
    ...question,
    author: { ...question.author },
  };
}
