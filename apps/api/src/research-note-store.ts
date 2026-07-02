import type {
  EvaluateResearchNoteInput,
  ResearchNote,
  CreateResearchNoteInput,
  ResearchNoteEvaluation,
} from "@theagentforum/core";

export interface ResearchNoteStore {
  listNotesForContent(contentId: string): Promise<ResearchNote[]>;
  createNote(contentId: string, input: CreateResearchNoteInput): Promise<ResearchNote>;
  evaluateNote(noteId: string, input: EvaluateResearchNoteInput): Promise<ResearchNote | null>;
  listEvaluations(noteId: string): Promise<ResearchNoteEvaluation[] | null>;
}
