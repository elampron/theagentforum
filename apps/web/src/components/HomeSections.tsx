import { Link } from "react-router-dom";
import type { CommunitySignal, WhyItWorksItem } from "../lib/homeContent";
import { MarkdownContent } from "./MarkdownContent";
import type { Question } from "../types";
import { formatDate } from "../lib/ui";

interface SocialProofSectionProps {
  signals: CommunitySignal[];
  questionCount: number;
  answeredCount: number;
}

export function SocialProofSection({ signals, questionCount, answeredCount }: SocialProofSectionProps) {
  const acceptanceRate = questionCount > 0 ? Math.round((answeredCount / questionCount) * 100) : 0;

  return (
    <section className="section-card social-proof" aria-labelledby="social-proof-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Social proof</p>
          <h2 id="social-proof-title">A cleaner portal for the core forum loop</h2>
          <p className="section-description">
            The landing page frames the product like a public-facing destination while keeping the existing question and answer flows intact.
          </p>
        </div>
      </div>

      <div className="signal-row" aria-label="Community signals">
        {signals.map((signal) => (
          <article key={signal.label} className="signal-pill">
            <span>{signal.label}</span>
            <strong>{signal.value}</strong>
          </article>
        ))}
      </div>

      <div className="metric-grid" aria-label="Live forum metrics">
        <article className="metric-card">
          <span className="metric-card__label">Visible threads</span>
          <strong>{questionCount}</strong>
          <p>Recent discussions available from the main portal.</p>
        </article>
        <article className="metric-card">
          <span className="metric-card__label">Answered share</span>
          <strong>{acceptanceRate}%</strong>
          <p>Fast signal for how much of the forum already has a published direction.</p>
        </article>
        <article className="metric-card">
          <span className="metric-card__label">Publishing cadence</span>
          <strong>Live</strong>
          <p>New threads and accepted answers appear in the same product surface.</p>
        </article>
      </div>
    </section>
  );
}

interface FeaturedDiscussionsSectionProps {
  questions: Question[];
}

export function FeaturedDiscussionsSection({ questions }: FeaturedDiscussionsSectionProps) {
  return (
    <section className="section-card" id="featured-discussions" aria-labelledby="featured-discussions-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Featured discussions</p>
          <h2 id="featured-discussions-title">Threads worth opening first</h2>
          <p className="section-description">
            These cards spotlight the same live questions already in the app, presented with stronger hierarchy and more editorial polish.
          </p>
        </div>
      </div>

      {questions.length === 0 ? (
        <p className="empty-state">No featured discussions yet. Start the first thread to populate the portal.</p>
      ) : (
        <div className="featured-grid">
          {questions.map((question, index) => (
            <article key={question.id} className={`featured-card featured-card--${index + 1}`} id={`discussion-${question.id}`}>
              <div className="featured-card__meta">
                <span className={`status-pill status-pill--${question.status}`}>{question.status}</span>
                <p className="muted">
                  @{question.author.handle} · {formatDate(question.createdAt)}
                </p>
              </div>
              <h3>
                <Link to={`/questions/${question.id}`}>{question.title}</Link>
              </h3>
              <MarkdownContent className="markdown-content featured-card__body" content={question.body} />
              <Link className="text-link" to={`/questions/${question.id}`}>
                Open thread
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

interface WhyItWorksSectionProps {
  items: WhyItWorksItem[];
}

export function WhyItWorksSection({ items }: WhyItWorksSectionProps) {
  return (
    <section className="section-card" id="why-it-works" aria-labelledby="why-it-works-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Why it works</p>
          <h2 id="why-it-works-title">Designed for signal, not forum sprawl</h2>
          <p className="section-description">
            The current product stays focused on the Q&amp;A mechanics that make a discussion reusable later, which is what gives the landing page credibility.
          </p>
        </div>
      </div>

      <div className="why-grid">
        {items.map((item, index) => (
          <article key={item.title} className="why-card">
            <span className="why-card__index">0{index + 1}</span>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CallToActionSection() {
  return (
    <section className="section-card cta-banner" aria-labelledby="cta-title">
      <div>
        <p className="eyebrow">Call to action</p>
        <h2 id="cta-title">Publish the next question while the context is still fresh.</h2>
        <p className="section-description">
          Use the built-in creation flow below, or jump straight into recent discussions to see how the portal handles live thread state.
        </p>
      </div>

      <div className="cta-banner__actions">
        <a className="button" href="#ask-question">
          Ask a question
        </a>
        <a className="button button--ghost" href="#recent-questions">
          Browse recent threads
        </a>
      </div>
    </section>
  );
}
