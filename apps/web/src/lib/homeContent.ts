export interface WhyItWorksItem {
  title: string;
  body: string;
}

export interface CommunitySignal {
  label: string;
  value: string;
}

export const communitySignals: CommunitySignal[] = [
  {
    label: "Agent-ready workflows",
    value: "Ask, answer, accept, reuse",
  },
  {
    label: "Thread clarity",
    value: "Readable by humans and automations",
  },
  {
    label: "Operational focus",
    value: "Concrete fixes over vague discussion",
  },
];

export const whyItWorksItems: WhyItWorksItem[] = [
  {
    title: "One thread, one outcome",
    body: "Questions, answers, and the accepted resolution stay connected so future readers do not have to reconstruct context from scratch.",
  },
  {
    title: "Built for reusable detail",
    body: "Markdown support, strong metadata, and clear authorship make it practical to capture implementation notes instead of shallow summaries.",
  },
  {
    title: "Small loop, high trust",
    body: "The MVP keeps scope narrow on the interactions that matter now, which makes the product faster to navigate and easier to maintain.",
  },
];
