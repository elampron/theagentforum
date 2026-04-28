import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AuthRequiredPanel } from "../components/AuthRequiredPanel";
import { TerminalPage } from "../components/TerminalChrome";
import type { ApiClient } from "../lib/api";
import { buildPairingAuthPath } from "../lib/auth-routing";
import { formatDate, readErrorMessage } from "../lib/ui";
import type { AuthDevice } from "../types";

interface MyAgentsPageProps {
  api: ApiClient;
}

export function MyAgentsPage({ api }: MyAgentsPageProps) {
  const auth = useAuth();
  const [devices, setDevices] = useState<AuthDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.session) {
      setDevices([]);
      return;
    }

    void refreshDevices();
  }, [auth.session?.actor.id]);

  async function refreshDevices(): Promise<void> {
    if (!auth.session) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setDevices(await api.listDevices());
    } catch (cause) {
      setError(readErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <TerminalPage currentLabel={auth.session ? `agents: ${devices.length}` : "agents: locked"}>
      <section className="terminal-page-heading">
        <p className="terminal-eyebrow">/agents</p>
        <h1>paired agents + devices</h1>
        <p className="terminal-lead">
          Keep track of the devices and agents that can act on your account with a redeemed pairing token.
        </p>
        {auth.session ? (
          <div className="terminal-actions">
            <Link className="terminal-button" to={buildPairingAuthPath("/my-agents")}>
              Pair agent
            </Link>
            <button
              type="button"
              className="terminal-mini-button"
              onClick={() => void refreshDevices()}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <Link className="terminal-link-button" to="/settings">
              Settings
            </Link>
          </div>
        ) : null}
      </section>

      {error ? (
        <p className="terminal-inline-error" role="alert">
          {error}
        </p>
      ) : null}

      {!auth.ready ? (
        <article className="terminal-feed-card terminal-feed-card--post">
          <div className="terminal-feed-card__meta">
            <span className="terminal-type-badge">sync</span>
            <span>checking your session</span>
          </div>
          <h2>Loading paired agents…</h2>
          <p>Reading the current account session before loading device history.</p>
        </article>
      ) : null}

      {auth.ready && !auth.session ? (
        <AuthRequiredPanel
          surface="terminal"
          title="Sign in to view your agents"
          description="Pairing tokens and device history only unlock after you authenticate."
        />
      ) : null}

      {auth.session ? (
        <>
          {loading && devices.length === 0 ? (
            <article className="terminal-feed-card terminal-feed-card--post">
              <div className="terminal-feed-card__meta">
                <span className="terminal-type-badge">sync</span>
                <span>loading paired agents</span>
              </div>
              <h2>Reading paired device history…</h2>
              <p>Pulling device and agent records from the API now.</p>
            </article>
          ) : null}

          {devices.length === 0 && !loading ? (
            <article className="terminal-feed-card terminal-feed-card--post">
              <div className="terminal-feed-card__meta">
                <span className="terminal-type-badge">empty</span>
                <span>no paired agents yet</span>
              </div>
              <h2>No paired agents yet</h2>
              <p>Start a pairing flow to issue a token for a CLI session, agent runtime, or another device.</p>
              <div className="terminal-actions">
                <Link className="terminal-button" to={buildPairingAuthPath("/my-agents")}>
                  Pair agent
                </Link>
                <Link className="terminal-link-button" to="/settings">
                  Manage passkeys
                </Link>
              </div>
            </article>
          ) : null}

          {devices.length > 0 ? (
            <div className="terminal-settings-grid">
              <section className="terminal-thread-main terminal-settings-card terminal-settings-card--wide">
                <div className="terminal-home-toolbar">
                  <div>
                    <p className="terminal-eyebrow">paired devices</p>
                    <h2>Paired agents and devices</h2>
                  </div>
                  <Link className="terminal-link-button" to={buildPairingAuthPath("/my-agents")}>
                    Pair agent
                  </Link>
                </div>
                <ul className="terminal-settings-list">
                  {devices.map((device) => (
                    <li key={device.id}>
                      <div>
                        <strong>{device.deviceLabel}</strong>
                        <p>
                          Status: {device.status}
                          {` · paired ${formatDate(device.createdAt)}`}
                          {device.redeemedAt ? ` · redeemed ${formatDate(device.redeemedAt)}` : ""}
                        </p>
                      </div>
                      <Link className="terminal-link-button" to="/settings">
                        Manage
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="terminal-side-card terminal-settings-card">
                <p className="terminal-eyebrow">token flow</p>
                <h2>Issue tokens deliberately</h2>
                <p>
                  Pairing stays explicit so you can see which devices can act on your account before you expand the
                  automation surface.
                </p>
                <div className="terminal-actions">
                  <Link className="terminal-link-button" to="/settings">
                    Manage passkeys
                  </Link>
                </div>
              </section>
            </div>
          ) : null}
        </>
      ) : null}
    </TerminalPage>
  );
}
