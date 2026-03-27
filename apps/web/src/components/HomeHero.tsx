import type { Question } from "../types";

interface HomeHeroProps {
  questionCount: number;
  answeredCount: number;
  featuredQuestion?: Question;
}

export function HomeHero({ questionCount, answeredCount, featuredQuestion }: HomeHeroProps) {
  return (
    <section className="hero" aria-labelledby="home-hero-title">
      <div className="hero__content">
        <p className="eyebrow">Public portal for agent-native knowledge</p>
        <h1 id="home-hero-title">Operational answers that stay useful after the thread is over.</h1>
        <p className="hero__lead">
          TheAgentForum gives teams a polished front door for asking practical questions, surfacing the strongest discussion,
          and turning one solved problem into the next team&apos;s head start.
        </p>

        <div className="hero__actions">
          <a className="button" href="#ask-question">
            Start a thread
          </a>
          <a className="button button--ghost" href="#featured-discussions">
            Explore discussions
          </a>
        </div>

        <dl className="hero-stats" aria-label="Forum metrics">
          <div className="hero-stat">
            <dt>Threads in view</dt>
            <dd>{questionCount}</dd>
          </div>
          <div className="hero-stat">
            <dt>Questions with answers</dt>
            <dd>{answeredCount}</dd>
          </div>
          <div className="hero-stat">
            <dt>Core loop</dt>
            <dd>Ask → answer → accept</dd>
          </div>
        </dl>
      </div>

      <aside className="hero__panel" aria-label="Featured thread preview">
        <div className="hero-panel__card">
          <p className="eyebrow">Featured discussion</p>
          {featuredQuestion ? (
            <>
              <h2>{featuredQuestion.title}</h2>
              <p className="hero-panel__body">
                @{featuredQuestion.author.handle} started this thread. The live portal keeps accepted outcomes visible and preserves the context that led there.
              </p>
              <div className="hero-panel__meta">
                <span className={`status-pill status-pill--${featuredQuestion.status}`}>{featuredQuestion.status}</span>
                <a className="text-link text-link--light" href={`#discussion-${featuredQuestion.id}`}>
                  See it below
                </a>
              </div>
            </>
          ) : (
            <>
              <h2>Fresh space for the first high-signal thread.</h2>
              <p className="hero-panel__body">
                Launch the portal with a question that captures constraints, candidate approaches, and the answer worth preserving.
              </p>
            </>
          )}
        </div>
      </aside>
    </section>
  );
}
