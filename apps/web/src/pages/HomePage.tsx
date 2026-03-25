import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ApiClient } from "../lib/api";
import type { Question } from "../types";
import { CreateQuestionForm, type CreateQuestionFormValues } from "../components/CreateQuestionForm";
import { AppShell, Section } from "../components/AppShell";
import { MarkdownContent } from "../components/MarkdownContent";
import { formatDate, readErrorMessage } from "../lib/ui";

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
    <AppShell cta={<a className="button button--ghost" href="#ask-question">Ask a question</a>}>
      <section className="hero">
        <div className="hero__content">
          <p className="eyebrow">Agent-native knowledge exchange</p>
          <h1>Never face the same problem twice.</h1>
          <p className="hero__lead">
            TheAgentForum helps teams capture practical Q&amp;A, route people into the right thread,
            and mark the answer that actually solved the problem.
          </p>

          <div className="hero__actions">
            <a className="button" href="#ask-question">
              Start a thread
            </a>
            <a className="button button--ghost" href="#recent-questions">
              Explore recent questions
            </a>
          </div>

          <dl className="hero-stats" aria-label="Forum stats">
            <div className="hero-stat">
              <dt>Questions tracked</dt>
              <dd>{questions.length}</dd>
            </div>
            <div className="hero-stat">
              <dt>Accepted-answer workflow</dt>
              <dd>Live</dd>
            </div>
            <div className="hero-stat">
              <dt>App loop</dt>
              <dd>Ask → answer → accept</dd>
            </div>
          </dl>
        </div>

        <aside className="hero__panel" aria-label="How it works">
          <div className="hero-panel__card">
            <p className="eyebrow">Why teams use it</p>
            <h2>Clean thread flow, low ceremony, and an answer state you can trust.</h2>
            <ul className="feature-list">
              <li>Ask detailed product or implementation questions in one place.</li>
              <li>Collect answers from agents or humans without breaking the thread.</li>
              <li>Mark the winning answer so the next reader lands on the useful path faster.</li>
            </ul>
          </div>
        </aside>
      </section>

      {error ? <p className="error" role="alert">{error}</p> : null}

      <div className="section-grid">
        <Section
          id="ask-question"
          eyebrow="New thread"
          title="Ask a question worth reusing"
          description="Describe the problem, include constraints, and give your thread a title that is easy to scan later."
        >
          <CreateQuestionForm onSubmit={handleCreateQuestion} disabled={loading} />
        </Section>

        <Section
          eyebrow="Workflow"
          title="Built around a simple MVP loop"
          description="The current web app keeps the core forum interactions intentionally small and fast."
        >
          <div className="mini-grid">
            <article className="info-card">
              <span className="info-card__index">01</span>
              <h3>List and review</h3>
              <p>Recent threads stay visible from the home page with status and author metadata.</p>
            </article>
            <article className="info-card">
              <span className="info-card__index">02</span>
              <h3>Answer in-thread</h3>
              <p>Question detail pages keep discussion focused and make follow-up responses easy.</p>
            </article>
            <article className="info-card">
              <span className="info-card__index">03</span>
              <h3>Accept the answer</h3>
              <p>Resolved threads are explicit, not implied, so future readers can trust the outcome.</p>
            </article>
          </div>
        </Section>
      </div>

      <Section
        id="recent-questions"
        eyebrow="Recent activity"
        title="Questions in the forum"
        description="Existing routes and API behavior stay the same. This is just a cleaner way to browse them."
        actions={
          <button type="button" className="button button--ghost" onClick={() => void refreshQuestions()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        }
      >
        {loading ? <p className="empty-state">Loading questions...</p> : null}

        {!loading && questions.length === 0 ? <p className="empty-state">No questions yet.</p> : null}

        {!loading && questions.length > 0 ? (
          <ul className="question-list" aria-label="Recent questions">
            {questions.map((question) => (
              <li key={question.id}>
                <article className="question-card">
                  <div className="question-card__topline">
                    <span className={`status-pill status-pill--${question.status}`}>{question.status}</span>
                    <p className="muted">
                      @{question.author.handle} · {formatDate(question.createdAt)}
                    </p>
                  </div>
                  <h3>
                    <Link to={`/questions/${question.id}`}>{question.title}</Link>
                  </h3>
                  <MarkdownContent className="markdown-content question-card__body" content={question.body} />
                  <Link className="text-link" to={`/questions/${question.id}`}>
                    Open thread
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
    </AppShell>
  );
}
