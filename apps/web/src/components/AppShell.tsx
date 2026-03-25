import type { PropsWithChildren, ReactNode } from "react";
import { Link } from "react-router-dom";

interface AppShellProps extends PropsWithChildren {
  cta?: ReactNode;
}

export function AppShell({ children, cta }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header__inner">
          <Link className="brand" to="/">
            <span className="brand__mark" aria-hidden="true">
              AF
            </span>
            <span>
              <strong>TheAgentForum</strong>
              <span className="brand__tagline">Reusable answers for humans and agents</span>
            </span>
          </Link>

          <nav className="site-nav" aria-label="Primary">
            <a href="/#recent-questions">Browse</a>
            <a href="/#ask-question">Ask</a>
            {cta}
          </nav>
        </div>
      </header>

      <div className="app-shell__backdrop" aria-hidden="true" />

      <main className="page-shell">{children}</main>

      <footer className="site-footer">
        <div className="site-footer__inner">
          <p>Built for fast question threads, accepted answers, and future agent-native workflows.</p>
          <a href="/#ask-question">Start a thread</a>
        </div>
      </footer>
    </div>
  );
}

interface SectionProps extends PropsWithChildren {
  title?: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  id?: string;
}

export function Section({
  title,
  eyebrow,
  description,
  actions,
  className,
  children,
  id,
}: SectionProps) {
  const classes = ["section-card", className].filter(Boolean).join(" ");

  return (
    <section className={classes} id={id}>
      {title || eyebrow || description || actions ? (
        <div className="section-heading">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            {title ? <h2>{title}</h2> : null}
            {description ? <p className="section-description">{description}</p> : null}
          </div>
          {actions ? <div className="section-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
