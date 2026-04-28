import type { ApiClient } from "../lib/api";
import { PostDetailPage } from "./TerminalGraphPages";

interface QuestionPageProps {
  api: ApiClient;
}

export function QuestionPage({ api }: QuestionPageProps) {
  return <PostDetailPage api={api} />;
}
