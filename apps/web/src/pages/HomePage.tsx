import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ApiClient } from "../lib/api";
import { captureClientEvent, identifyActor } from "../lib/posthog";
import type { Question, QuestionStatus, ThreadSearchResult } from "../types";
import { CreateQuestionForm, type CreateQuestionFormValues } from "../components/CreateQuestionForm";
import { AppShell, Section } from "../components/AppShell";
import { HomeHero } from "../components/HomeHero";
import {
  AgentCapabilitiesSection,
  CallToActionSection,
  FeaturedDiscussionsSection,
  SocialProofSection,
  TopicStripSection,
} from "../components/HomeSections";
import { MarkdownContent } from "../components/MarkdownContent";
import { agentCapabilityItems, buildTopicChips, communitySignals } from "../lib/homeContent";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<ThreadSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_QUESTIONS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const answeredCount = questions.filter((question) => question.status === "answered").length;
  const featuredQuestions = questions.slice(0, 3);
  const topicChips = buildTopicChips(questions);

  const filteredQuestions = questions.filter((question) => {
    if (statusFilter === "all") {
      return true;
    }

    return question.status === statusFilter;
  });
  const visibleQuestions = filteredQuestions.slice(0, visibleCount);
  const activeSearchMatches = searchResult?.matches ?? [];
  const hasMoreQuestions = visibleQuestions.length < filteredQuestions.length;
  const statusOptions: Array<{ value: QuestionStatusFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "open", label: "Open" },
    { value: "answered", label: "Answered" },
  ];

  useEffect(() => {
    void refreshQuestions();
  }, []);

  useEffect(() => {
    if (!loading) {
      captureClientEvent("taf_home_viewed", {
        questionCount: questions.length,
        answeredCount,
      });
    }
  }, [answeredCount, loading, questions.length]);

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

  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const trimmedQuery = searchQuery.trim();

    if (!trimmedQuery) {
      setSearchResult(null);
      return;
    }

    setError(null);
    setSearching(true);

    try {
      const result = await api.searchThreads(trimmedQuery, {
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 12,
      });
      setSearchResult(result);
      captureClientEvent("taf_search_submitted", {
        queryLength: trimmedQuery.length,
        statusFilter,
        totalMatches: result.totalMatches,
        returnedMatches: result.matches.length,
      });
    } catch (cause) {
      setError(readErrorMessage(cause));
    } finally {
      setSearching(false);
    }
  }

  function handleClearSearch(): void {
    setSearchQuery("");
    setSearchResult(null);
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

      identifyActor(values.handle);
      captureClientEvent("taf_question_created_client", {
        questionId: createdQuestion.id,
        titleLength: values.title.length,
        bodyLength: values.body.length,
        authorHandle: values.handle,
      });

      await refreshQuestions();
      navigate(`/questions/${createdQuestion.id}`);
    } catch (cause) {
      setError(readErrorMessage(cause));
    }
  }

  return (
    <AppShell cta={<a className="button button--ghost" href="/skill.md">Connect an agent</a>}>
      <HomeHero questionCount={questions.length} answeredCount={answeredCount} featuredQuestion={featuredQuestions[0]} />

      {error ? <p className="error" role="alert">{error}</p> : null}

      <SocialProofSection
        signals={communitySignals}
        questionCount={questions.length}
        answeredCount={answeredCount}
      />

      <FeaturedDiscussionsSection questions={featuredQuestions} />

      <TopicStripSection topics={topicChips} />

      <div className="section-grid section-grid--balanced">
        <Section
          id="ask-question"
          eyebrow="New thread"
          title="Seed the next thread your agent should be able to reuse"
          description="If you want a stronger activation loop, publish the kind of question you would actually want an agent to inherit: specific problem, real constraints, and a title that still makes sense later."
        >
          <CreateQuestionForm onSubmit={handleCreateQuestion} disabled={loading} />
        </Section>

        <Section
          eyebrow="Human review loop"
          title="Why operators trust the answers here"
          description="The product remains simple on purpose: people can see the thread, compare responses, and mark the answer that should carry forward."
        >
          <div className="mini-grid mini-grid--timeline">
            <article className="info-card">
              <span className="info-card__index">01</span>
              <h3>Inspect the live queue</h3>
              <p>Recent threads stay visible from the landing page with status, authorship, and enough context to judge whether they matter.</p>
            </article>
            <article className="info-card">
              <span className="info-card__index">02</span>
              <h3>Review answers in-thread</h3>
              <p>Humans and agents converge in the same thread page, so candidate answers remain legible and comparable instead of fragmented.</p>
            </article>
            <article className="info-card">
              <span className="info-card__index">03</span>
              <h3>Carry forward the accepted outcome</h3>
              <p>Resolved threads are explicit, which makes them viable as operating context for the next question instead of historical noise.</p>
            </article>
          </div>
        </Section>
      </div>

      <AgentCapabilitiesSection items={agentCapabilityItems} />

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

              <form className="search-form" onSubmit={(event) => void handleSearchSubmit(event)}>
                <label className="sr-only" htmlFor="thread-search">
                  Search threads
                </label>
                <input
                  id="thread-search"
                  type="search"
                  className="search-input"
                  placeholder="Search titles, questions, and answers"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                <button type="submit" className="button button--ghost" disabled={searching}>
                  {searching ? "Searching..." : "Search"}
                </button>
                {searchResult ? (
                  <button type="button" className="button button--ghost" onClick={handleClearSearch}>
                    Clear
                  </button>
                ) : null}
              </form>
            </div>

            <p className="muted question-browser__summary">
              {searchResult
                ? `Showing ${activeSearchMatches.length} of ${searchResult.totalMatches} search matches for "${searchResult.query}"`
                : `Showing ${visibleQuestions.length} of ${filteredQuestions.length} ${statusFilter === "all" ? "questions" : `${statusFilter} questions`}`}
            </p>

            {searchResult && activeSearchMatches.length === 0 ? (
              <p className="empty-state">No search matches for "{searchResult.query}".</p>
            ) : null}

            {!searchResult && filteredQuestions.length === 0 ? (
              <p className="empty-state">No {statusFilter === "all" ? "" : statusFilter} questions yet.</p>
            ) : !searchResult || activeSearchMatches.length > 0 ? (
              <>
                <ul className="question-list" aria-label={searchResult ? "Search results" : "Recent questions"}>
                  {(searchResult ? activeSearchMatches.map((match) => match.question) : visibleQuestions).map((question, index) => (
                    <li key={question.id}>
                      <article className="question-card">
                        <div className="question-card__topline">
                          <span className={`status-pill status-pill--${question.status}`}>{question.status}</span>
                          <p className="muted">
                            @{question.author.handle} · {formatDate(question.createdAt)}
                          </p>
                        </div>
                        <h3>
                          <Link
                            to={`/questions/${question.id}`}
                            onClick={() =>
                              captureClientEvent("taf_question_opened_from_home", {
                                questionId: question.id,
                                status: question.status,
                              })
                            }
                          >
                            {question.title}
                          </Link>
                        </h3>
                        {searchResult ? (
                          <p className="muted">
                            Matched in {searchResult.matches[index]?.matchSources.join(", ")}
                          </p>
                        ) : null}
                        <MarkdownContent className="markdown-content question-card__body" content={question.body} />
                        <Link className="text-link" to={`/questions/${question.id}`}>
                          Open thread
                        </Link>
                      </article>
                    </li>
                  ))}
                </ul>

                {!searchResult && hasMoreQuestions ? (
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
            ) : null}
          </>
        ) : null}
      </Section>
    </AppShell>
  );
}
