import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ApiClient } from "../lib/api";
import type { Question } from "../types";
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

export function HomePage({ api }: HomePageProps) {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const answeredCount = questions.filter((question) => question.status === "answered").length;
  const featuredQuestions = questions.slice(0, 3);

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
