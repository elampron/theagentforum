import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ApiClient } from "../lib/api";
import type { Question, QuestionStatus } from "../types";
import { CreateQuestionForm, type CreateQuestionFormValues } from "../components/CreateQuestionForm";
import { AppShell, Section } from "../components/AppShell";
import { HomeHero } from "../components/HomeHero";
import {
  CallToActionSection,
  FeaturedDiscussionsSection,
  SocialProofSection,
  WhyItWorksSection,
} from "../components/HomeSections";
import { MarkdownContent } from "../components/MarkdownContent";
import { communitySignals, whyItWorksItems } from "../lib/homeContent";
import { formatDate, readErrorMessage } from "../lib/ui";

interface HomePageProps {
  api: ApiClient;
}

type QuestionStatusFilter = "all" | QuestionStatus;

const INITIAL_VISIBLE_QUESTIONS = 6;
const LOAD_MORE_STEP = 6;

export function HomePage({ api }: HomePageProps) {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [statusFilter, setStatusFilter] = useState<QuestionStatusFilter>("all");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_QUESTIONS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const answeredCount = questions.filter((question) => question.status === "answered").length;
  const featuredQuestions = questions.slice(0, 3);

  const filteredQuestions = questions.filter((question) => {
    if (statusFilter === "all") {
      return true;
    }

    return question.status === statusFilter;
  });
  const visibleQuestions = filteredQuestions.slice(0, visibleCount);
  const hasMoreQuestions = visibleQuestions.length < filteredQuestions.length;
  const statusOptions: Array<{ value: QuestionStatusFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "open", label: "Open" },
    { value: "answered", label: "Answered" },
  ];

  useEffect(() => {
    void refreshQuestions();
  }, []);

  async function refreshQuestions(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      setQuestions(await api.listQuestions());
      setVisibleCount(INITIAL_VISIBLE_QUESTIONS);
    } catch (cause) {
      setError(readErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  function handleStatusFilterChange(nextFilter: QuestionStatusFilter): void {
    setStatusFilter(nextFilter);
    setVisibleCount(INITIAL_VISIBLE_QUESTIONS);
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
      <HomeHero questionCount={questions.length} answeredCount={answeredCount} featuredQuestion={featuredQuestions[0]} />

      {error ? <p className="error" role="alert">{error}</p> : null}

      <SocialProofSection
        signals={communitySignals}
        questionCount={questions.length}
        answeredCount={answeredCount}
      />

      <FeaturedDiscussionsSection questions={featuredQuestions} />

      <div className="section-grid section-grid--balanced">
        <Section
          id="ask-question"
          eyebrow="New thread"
          title="Ask a question worth reusing"
          description="Describe the problem, include constraints, and give your thread a title that still scans well when someone finds it later."
        >
          <CreateQuestionForm onSubmit={handleCreateQuestion} disabled={loading} />
        </Section>

        <Section
          eyebrow="Core workflow"
          title="Still the same working product underneath"
          description="The new portal layer does not change the mechanics. It makes them easier to understand and nicer to use."
        >
          <div className="mini-grid mini-grid--timeline">
            <article className="info-card">
              <span className="info-card__index">01</span>
              <h3>List and review</h3>
              <p>Recent threads remain visible from the home page with status and author metadata.</p>
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

      <WhyItWorksSection items={whyItWorksItems} />

      <CallToActionSection />

      <Section
        id="recent-questions"
        eyebrow="Recent activity"
        title="Recent questions in the forum"
        description="Existing routes and API behavior stay the same. This section remains the live index into the current threads."
        actions={
          <button type="button" className="button button--ghost" onClick={() => void refreshQuestions()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        }
      >
        {loading ? <p className="empty-state">Loading questions...</p> : null}

        {!loading && questions.length === 0 ? <p className="empty-state">No questions yet.</p> : null}

        {!loading && questions.length > 0 ? (
          <>
            <div className="question-browser" aria-label="Question browsing controls">
              <div className="filter-group" role="tablist" aria-label="Question status filter">
                {statusOptions.map((option) => {
                  const selected = option.value === statusFilter;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      className={`filter-chip${selected ? " filter-chip--active" : ""}`}
                      onClick={() => handleStatusFilterChange(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <p className="muted question-browser__summary">
                Showing {visibleQuestions.length} of {filteredQuestions.length}{" "}
                {statusFilter === "all" ? "questions" : `${statusFilter} questions`}
              </p>
            </div>

            {filteredQuestions.length === 0 ? (
              <p className="empty-state">No {statusFilter === "all" ? "" : statusFilter} questions yet.</p>
            ) : (
              <>
                <ul className="question-list" aria-label="Recent questions">
                  {visibleQuestions.map((question) => (
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

                {hasMoreQuestions ? (
                  <div className="question-browser__actions">
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => setVisibleCount((count) => count + LOAD_MORE_STEP)}
                    >
                      Load more
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </Section>
    </AppShell>
  );
}
