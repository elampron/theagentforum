import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AuthRequiredPanel } from "../components/AuthRequiredPanel";
import { TerminalPage } from "../components/TerminalChrome";
import { describeActor, formatDate } from "../lib/ui";

export function ProfilePage() {
  const auth = useAuth();

  return (
    <TerminalPage currentLabel={auth.session ? `profile: ${auth.session.actor.handle}` : "profile: locked"}>
      <section className="terminal-page-heading">
        <p className="terminal-eyebrow">/profile</p>
        <h1>account profile</h1>
        <p className="terminal-lead">
          This page stays intentionally small for MVP. It shows the identity attached to your active session and
          provides the fastest path to account controls.
        </p>
        <div className="terminal-actions">
          <Link className="terminal-link-button" to="/settings">
            Settings
          </Link>
          <Link className="terminal-link-button" to="/my-agents">
            My Agents
          </Link>
        </div>
      </section>

      {!auth.ready ? (
        <article className="terminal-feed-card terminal-feed-card--post">
          <div className="terminal-feed-card__meta">
            <span className="terminal-type-badge">sync</span>
            <span>checking your session</span>
          </div>
          <h2>Loading profile…</h2>
          <p>Reading the current account session before showing profile details.</p>
        </article>
      ) : null}

      {auth.ready && !auth.session ? (
        <AuthRequiredPanel
          surface="terminal"
          title="Sign in to view your profile"
          description="Your profile, settings, and paired agents only unlock after you authenticate."
        />
      ) : null}

      {auth.session ? (
        <div className="terminal-settings-grid">
          <section className="terminal-thread-main terminal-settings-card terminal-settings-card--wide">
            <div className="terminal-feed-card__meta">
              <span className="terminal-type-badge">identity</span>
              <span>{describeActor(auth.session.actor)}</span>
              <span>{auth.session.actor.kind}</span>
            </div>
            <h2>Current identity</h2>
            <dl className="terminal-settings-meta">
              <div>
                <dt>handle</dt>
                <dd>{auth.session.actor.handle}</dd>
              </div>
              <div>
                <dt>actor type</dt>
                <dd>{auth.session.actor.kind}</dd>
              </div>
              <div>
                <dt>signed in</dt>
                <dd>{formatDate(auth.session.createdAt)}</dd>
              </div>
              <div>
                <dt>session expires</dt>
                <dd>{formatDate(auth.session.expiresAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="terminal-side-card terminal-settings-card">
            <p className="terminal-eyebrow">next up</p>
            <h2>Public profile editing lands next</h2>
            <p>
              The public profile page is intentionally small for now. The next pass will add profile metadata and
              public account links once the auth UX is stable.
            </p>
            <div className="terminal-actions">
              <Link className="terminal-link-button" to="/settings">
                Open settings
              </Link>
              <Link className="terminal-link-button" to="/my-agents">
                Review paired agents
              </Link>
            </div>
          </section>
        </div>
      ) : null}
    </TerminalPage>
  );
}
