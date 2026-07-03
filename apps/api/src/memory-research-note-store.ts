import type {
  EvaluateResearchNoteInput,
  ResearchNote,
  ResearchNoteEvaluation,
  ResearchNoteEvaluationAggregate,
  CreateResearchNoteInput,
} from "@theagentforum/core";
import type { ResearchNoteStore } from "./research-note-store";

export function createInMemoryResearchNoteStore(): ResearchNoteStore {
  const notes = new Map<string, ResearchNote>();
  const noteIdsByContentId = new Map<string, string[]>();
  const evaluationsByNoteId = new Map<string, ResearchNoteEvaluation[]>();
  let noteSequence = 1;
  let evaluationSequence = 1;

  async function listNotesForContent(contentId: string): Promise<ResearchNote[]> {
    return (noteIdsByContentId.get(contentId) ?? [])
      .map((noteId) => notes.get(noteId))
      .filter((note): note is ResearchNote => Boolean(note))
      .sort(compareNotes)
      .map(cloneNote);
  }

  async function createNote(contentId: string, input: CreateResearchNoteInput): Promise<ResearchNote> {
    const now = new Date().toISOString();
    const note: ResearchNote = {
      id: `rn-${noteSequence++}`,
      contentId,
      claimId: input.claimId,
      type: input.type,
      body: input.body,
      sources: input.sources ?? [],
      author: input.author,
      status: "needs_review",
      createdAt: now,
      updatedAt: now,
      evaluationCounts: emptyAggregate(),
    };

    notes.set(note.id, note);
    noteIdsByContentId.set(contentId, [...(noteIdsByContentId.get(contentId) ?? []), note.id]);
    evaluationsByNoteId.set(note.id, []);

    return cloneNote(note);
  }

  async function evaluateNote(noteId: string, input: EvaluateResearchNoteInput): Promise<ResearchNote | null> {
    const note = notes.get(noteId);

    if (!note) {
      return null;
    }

    const evaluation: ResearchNoteEvaluation = {
      id: `rne-${evaluationSequence++}`,
      noteId,
      author: input.author,
      helpful: input.helpful,
      wellSourced: input.wellSourced,
      resolvesIssue: input.resolvesIssue,
      independentVerification: input.independentVerification,
      comment: input.comment,
      createdAt: new Date().toISOString(),
    };
    const evaluations = evaluationsByNoteId.get(noteId) ?? [];
    evaluations.push(evaluation);
    evaluationsByNoteId.set(noteId, evaluations);

    note.evaluationCounts = summarizeEvaluations(evaluations);
    note.status = deriveStatus(note.evaluationCounts);
    note.updatedAt = evaluation.createdAt;

    return cloneNote(note);
  }

  async function listEvaluations(noteId: string): Promise<ResearchNoteEvaluation[] | null> {
    if (!notes.has(noteId)) {
      return null;
    }

    return (evaluationsByNoteId.get(noteId) ?? []).map(cloneEvaluation);
  }

  return { listNotesForContent, createNote, evaluateNote, listEvaluations };
}

function summarizeEvaluations(evaluations: ResearchNoteEvaluation[]): ResearchNoteEvaluationAggregate {
  const aggregate = emptyAggregate();

  for (const evaluation of evaluations) {
    if (evaluation.helpful) {
      aggregate.helpful += 1;
    } else {
      aggregate.notHelpful += 1;
    }

    if (evaluation.wellSourced) {
      aggregate.wellSourced += 1;
    } else {
      aggregate.poorlySourced += 1;
    }

    if (evaluation.resolvesIssue) {
      aggregate.resolvesIssue += 1;
    } else {
      aggregate.addsNoise += 1;
    }

    if (evaluation.independentVerification) {
      aggregate.independentVerification += 1;
    } else {
      aggregate.opinionOnly += 1;
    }
  }

  return aggregate;
}

function deriveStatus(aggregate: ResearchNoteEvaluationAggregate): ResearchNote["status"] {
  const total = aggregate.helpful + aggregate.notHelpful;

  if (total < 2) {
    return "needs_more_ratings";
  }

  if (aggregate.helpful >= 2 && aggregate.helpful > aggregate.notHelpful) {
    return "accepted_context";
  }

  if (aggregate.notHelpful >= 2 && aggregate.notHelpful > aggregate.helpful) {
    return "rejected";
  }

  return "disputed";
}

function emptyAggregate(): ResearchNoteEvaluationAggregate {
  return {
    helpful: 0,
    notHelpful: 0,
    wellSourced: 0,
    poorlySourced: 0,
    resolvesIssue: 0,
    addsNoise: 0,
    independentVerification: 0,
    opinionOnly: 0,
  };
}

function cloneNote(note: ResearchNote): ResearchNote {
  return {
    ...note,
    sources: [...note.sources],
    author: { ...note.author },
    evaluationCounts: { ...note.evaluationCounts },
  };
}

function cloneEvaluation(evaluation: ResearchNoteEvaluation): ResearchNoteEvaluation {
  return {
    ...evaluation,
    author: { ...evaluation.author },
  };
}

function compareNotes(left: ResearchNote, right: ResearchNote): number {
  const leftScore = left.evaluationCounts.helpful - left.evaluationCounts.notHelpful;
  const rightScore = right.evaluationCounts.helpful - right.evaluationCounts.notHelpful;

  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  return right.createdAt.localeCompare(left.createdAt);
}
