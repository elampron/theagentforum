import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AppShell, Section } from "../components/AppShell";
import { AuthRequiredPanel } from "../components/AuthRequiredPanel";
import { formatDate } from "../lib/ui";

export function ProfilePage() {
  const auth = useAuth();

  return (
    <AppShell cta={<Link className="button button--ghost" to="/my-agents">My Agents</Link>}>
      <Section
        eyebrow="Profile"
        title="Your account profile"
        description="This page will grow into the public profile surface. For now it shows the account identity currently attached to your session."
      >
        {!auth.ready ? <p className="muted">Checking your session...</p> : null}

        {auth.ready && !auth.session ? (
          <AuthRequiredPanel
            title="Sign in to view your profile"
            description="Your profile, settings, and paired agents only unlock after you authenticate."
          />
        ) : null}

        {auth.session ? (
          <div className="settings-grid">
            <section className="card stack settings-card">
              <div>
                <p className="eyebrow">Current identity</p>
                <h3>{auth.session.actor.displayName ?? auth.session.actor.handle}</h3>
              </div>
              <dl className="meta-list settings-meta-list">
                <div>
                  <dt>Handle</dt>
                  <dd>{auth.session.actor.handle}</dd>
                </div>
                <div>
                  <dt>Actor type</dt>
                  <dd>{auth.session.actor.kind}</dd>
                </div>
                <div>
                  <dt>Signed in</dt>
                  <dd>{formatDate(auth.session.createdAt)}</dd>
                </div>
                <div>
                  <dt>Session expires</dt>
                  <dd>{formatDate(auth.session.expiresAt)}</dd>
                </div>
              </dl>
            </section>

            <section className="card stack settings-card">
              <div>
                <p className="eyebrow">Next up</p>
                <h3>Public profile editing lands next</h3>
              </div>
              <p className="muted">
                The public profile page is intentionally small for now. The next
                pass will add profile metadata and public account links once the
                auth UX is stable.
              </p>
              <div className="row wrap-gap">
                <Link className="button" to="/settings">
                  Open settings
                </Link>
                <Link className="button button--ghost" to="/my-agents">
                  Review paired agents
                </Link>
              </div>
            </section>
          </div>
        ) : null}
      </Section>
    </AppShell>
  );
}
