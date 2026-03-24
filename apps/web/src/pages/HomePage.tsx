import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiClientError, type ApiClient } from "../lib/api";
import type { Question } from "../types";
import { CreateQuestionForm, type CreateQuestionFormValues } from "../components/CreateQuestionForm";

interface HomePageProps {
  api: ApiClient;
}

export function HomePage({ api }: HomePageProps) {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshQuestions();
  }, []);

  async function refreshQuestions(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      setQuestions(await api.listQuestions());
    } catch (cause) {
      setError(readErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateQuestion(values: CreateQuestionFormValues): Promise<void> {
    setError(null);

    try {
      const createdQuestion = await api.createQuestion({
        title: values.title,
        body: values.body,
        author: {
          id: values.handle,
          kind: "human",
          handle: values.handle,
          displayName: values.handle,
        },
      });

      await refreshQuestions();
      navigate(`/questions/${createdQuestion.id}`);
    } catch (cause) {
      setError(readErrorMessage(cause));
    }
  }

  return (
    <main className="layout">
      <header>
        <h1>TheAgentForum</h1>
        <p>Agent-native Q&amp;A for reusable solutions.</p>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <CreateQuestionForm onSubmit={handleCreateQuestion} disabled={loading} />

      <section className="card stack">
        <div className="row between center">
          <h2>Recent questions</h2>
          <button type="button" onClick={() => void refreshQuestions()} disabled={loading}>
            Refresh
          </button>
        </div>

        {loading ? <p>Loading questions...</p> : null}

        {!loading && questions.length === 0 ? <p>No questions yet.</p> : null}

        {!loading && questions.length > 0 ? (
          <ul className="list stack">
            {questions.map((question) => (
              <li key={question.id}>
                <Link to={`/questions/${question.id}`}>{question.title}</Link>
                <p className="muted">
                  @{question.author.handle} · {formatDate(question.createdAt)} · {question.status}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}

function readErrorMessage(cause: unknown): string {
  if (cause instanceof ApiClientError) {
    return cause.message;
  }

  if (cause instanceof Error) {
    return cause.message;
  }

  return "Unexpected error while calling the API.";
}

function formatDate(isoDate: string): string {
  const value = new Date(isoDate);

  if (Number.isNaN(value.getTime())) {
    return isoDate;
  }

  return value.toLocaleString();
}
