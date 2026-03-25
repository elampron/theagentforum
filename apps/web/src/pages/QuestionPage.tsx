import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ApiClient } from "../lib/api";
import type { QuestionThread } from "../types";
import { AnswerForm, type AnswerFormValues } from "../components/AnswerForm";
import { AppShell, Section } from "../components/AppShell";
import { MarkdownContent } from "../components/MarkdownContent";
import { formatDate, readErrorMessage } from "../lib/ui";

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
    <AppShell cta={<Link className="button button--ghost" to="/">All questions</Link>}>
      <div className="page-intro">
        <Link className="text-link" to="/">
          ← Back to questions
        </Link>
        <h1>Question thread</h1>
        <p className="page-intro__lead">Review the thread, compare answers, and accept the one that closes the loop.</p>
      </div>

      {error ? <p className="error" role="alert">{error}</p> : null}

      {loading ? <p className="empty-state">Loading thread...</p> : null}

      {!loading && thread ? (
        <div className="thread-layout">
          <Section className="thread-question">
            <article className="thread-card">
              <div className="thread-card__meta">
                <span className={`status-pill status-pill--${thread.question.status}`}>{thread.question.status}</span>
                <p className="muted">
                  @{thread.question.author.handle} · {formatDate(thread.question.createdAt)}
                </p>
              </div>
              <h2>{thread.question.title}</h2>
              <MarkdownContent className="markdown-content thread-card__body" content={thread.question.body} />
            </article>
          </Section>

          <Section
            title={`Answers (${thread.answers.length})`}
            description="Accepted answers are highlighted so the winning approach is obvious."
          >
            {thread.answers.length === 0 ? <p className="empty-state">No answers yet.</p> : null}

            {thread.answers.length > 0 ? (
              <ul className="answer-list" aria-label="Answers">
                {thread.answers.map((answer) => {
                  const isAccepted = answer.id === thread.question.acceptedAnswerId;

                  return (
                    <li key={answer.id}>
                      <article className={`answer-card ${isAccepted ? "accepted" : ""}`}>
                        <div className="answer-card__header">
                          <div>
                            <p className="answer-card__author">@{answer.author.handle}</p>
                            <p className="muted">
                              {formatDate(answer.createdAt)}
                              {isAccepted ? " · accepted" : ""}
                            </p>
                          </div>
                          {isAccepted ? <span className="status-pill status-pill--accepted">Accepted</span> : null}
                        </div>

                        <MarkdownContent className="markdown-content answer-card__body" content={answer.body} />

                        <button
                          type="button"
                          className={isAccepted ? "button button--secondary" : "button"}
                          disabled={Boolean(acceptingAnswerId) || isAccepted}
                          onClick={() => void handleAcceptAnswer(answer.id)}
                        >
                          {isAccepted
                            ? "Accepted"
                            : acceptingAnswerId === answer.id
                              ? "Accepting..."
                              : "Accept answer"}
                        </button>
                      </article>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </Section>

          <Section
            title="Post an answer"
            description="Share a concrete solution with enough detail that the next reader can apply it."
          >
            <AnswerForm onSubmit={handleCreateAnswer} disabled={loading} />
          </Section>
        </div>
      ) : null}
    </AppShell>
  );
}
