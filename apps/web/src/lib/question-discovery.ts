import type { Question } from "../types";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "should",
  "the",
  "to",
  "using",
  "what",
  "when",
  "with",
]);

export interface SimilarQuestionMatch {
  question: Question;
  score: number;
  sharedTerms: string[];
}

interface FindSimilarQuestionsOptions {
  title: string;
  body?: string;
  questions: Question[];
  currentQuestionId?: string;
  limit?: number;
}

export function findSimilarQuestions({
  title,
  body = "",
  questions,
  currentQuestionId,
  limit = 3,
}: FindSimilarQuestionsOptions): SimilarQuestionMatch[] {
  const draftTitleTokens = tokenize(title);
  const draftBodyTokens = tokenize(body);

  if (draftTitleTokens.length === 0 && draftBodyTokens.length === 0) {
    return [];
  }

  return questions
    .filter((question) => question.id !== currentQuestionId)
    .map((question) => {
      const titleTokens = tokenize(question.title);
      const bodyTokens = tokenize(question.body);
      const sharedTitleTerms = intersect(draftTitleTokens, titleTokens);
      const sharedBodyTerms = intersect(
        [...draftTitleTokens, ...draftBodyTokens],
        [...titleTokens, ...bodyTokens],
      ).filter((term) => !sharedTitleTerms.includes(term));

      const phraseBonus = hasStrongPhraseMatch(title, question.title) ? 3 : 0;
      const answeredBonus = question.status === "answered" ? 0.6 : 0;
      const score =
        sharedTitleTerms.length * 2.4 +
        sharedBodyTerms.length * 0.9 +
        phraseBonus +
        answeredBonus;

      return {
        question,
        score,
        sharedTerms: [...sharedTitleTerms, ...sharedBodyTerms].slice(0, 4),
      };
    })
    .filter((match) => match.score >= 2.4)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function hasStrongPhraseMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizePhrase(left);
  const normalizedRight = normalizePhrase(right);

  return normalizedLeft.length >= 16 && normalizedRight.includes(normalizedLeft);
}

function normalizePhrase(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ");
}

function tokenize(value: string): string[] {
  const uniqueTokens = new Set<string>();

  for (const token of normalizePhrase(value).split(" ")) {
    if (token.length < 3 || STOP_WORDS.has(token)) {
      continue;
    }

    uniqueTokens.add(token);
  }

  return [...uniqueTokens];
}

function intersect(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((term) => rightSet.has(term));
}
