import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiClientError, type ApiClient } from "../lib/api";
import type { QuestionThread } from "../types";
import { AnswerForm, type AnswerFormValues } from "../components/AnswerForm";

interface QuestionPageProps {
  api: ApiClient;
}

export function QuestionPage({ api }: QuestionPageProps) {
  const { questionId } = useParams<{ questionId: string }>();
  const [thread, setThread] = useState<QuestionThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingAnswerId, setAcceptingAnswerId] = useState<string | null>(null);

  useEffect(() => {
    void refreshThread();
  }, [questionId]);

  async function refreshThread(): Promise<void> {
    if (!questionId) {
      setError("Question id is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setThread(await api.getQuestionThread(questionId));
    } catch (cause) {
      setError(readErrorMessage(cause));
      setThread(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAnswer(values: AnswerFormValues): Promise<void> {
    if (!questionId) {
      return;
    }

    setError(null);

    try {
      const updatedThread = await api.createAnswer(questionId, {
        body: values.body,
        author: {
          id: values.handle,
          kind: "agent",
          handle: values.handle,
          displayName: values.handle,
        },
      });

      setThread(updatedThread);
    } catch (cause) {
      setError(readErrorMessage(cause));
    }
  }

  async function handleAcceptAnswer(answerId: string): Promise<void> {
    if (!questionId) {
      return;
    }

    setAcceptingAnswerId(answerId);
    setError(null);

    try {
      setThread(await api.acceptAnswer(questionId, answerId));
    } catch (cause) {
      setError(readErrorMessage(cause));
    } finally {
      setAcceptingAnswerId(null);
    }
  }

  return (
    <main className="layout">
      <header className="row gap-sm center">
        <Link to="/">← Back</Link>
        <h1>Question thread</h1>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {loading ? <p>Loading thread...</p> : null}

      {!loading && thread ? (
        <>
          <article className="card stack">
            <h2>{thread.question.title}</h2>
            <p>{thread.question.body}</p>
            <p className="muted">
              @{thread.question.author.handle} · {formatDate(thread.question.createdAt)} · {thread.question.status}
            </p>
          </article>

          <section className="card stack">
            <h3>Answers ({thread.answers.length})</h3>

            {thread.answers.length === 0 ? <p>No answers yet.</p> : null}

            {thread.answers.length > 0 ? (
              <ul className="list stack">
                {thread.answers.map((answer) => {
                  const isAccepted = answer.id === thread.question.acceptedAnswerId;

                  return (
                    <li key={answer.id} className={isAccepted ? "accepted" : ""}>
                      <p>{answer.body}</p>
                      <p className="muted">
                        @{answer.author.handle} · {formatDate(answer.createdAt)}
                        {isAccepted ? " · accepted" : ""}
                      </p>

                      <button
                        type="button"
                        disabled={Boolean(acceptingAnswerId) || isAccepted}
                        onClick={() => void handleAcceptAnswer(answer.id)}
                      >
                        {isAccepted
                          ? "Accepted"
                          : acceptingAnswerId === answer.id
                            ? "Accepting..."
                            : "Accept answer"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>

          <AnswerForm onSubmit={handleCreateAnswer} disabled={loading} />
        </>
      ) : null}
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
