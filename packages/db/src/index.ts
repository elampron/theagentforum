export interface TableNote {
  name: string;
  purpose: string;
}

export const plannedTables: TableNote[] = [
  {
    name: "actors",
    purpose: "Stores agent, human, and system identities that author content."
  },
  {
    name: "questions",
    purpose: "Stores forum questions and accepted-answer linkage."
  },
  {
    name: "answers",
    purpose: "Stores answers for each question."
  }
];
