import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AppShell, Section } from "../components/AppShell";
import { AuthRequiredPanel } from "../components/AuthRequiredPanel";
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
  }, [auth.session]);

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
    <AppShell cta={<Link className="button button--ghost" to="/settings">Settings</Link>}>
      <Section
        eyebrow="My Agents"
        title="Paired agents and devices"
        description="Keep track of the devices and agents that can act on your account with a redeemed pairing token."
        actions={
          auth.session ? (
            <div className="settings-actions">
              <Link className="button" to={buildPairingAuthPath("/my-agents")}>
                Pair an agent
              </Link>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => void refreshDevices()}
                disabled={loading}
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          ) : undefined
        }
      >
        {!auth.ready ? <p className="muted">Checking your session...</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {auth.ready && !auth.session ? (
          <AuthRequiredPanel
            title="Sign in to view your agents"
            description="Pairing tokens and device history only unlock after you authenticate."
          />
        ) : null}

        {auth.session ? (
          <>
            {loading && devices.length === 0 ? (
              <p className="muted">Loading paired agents...</p>
            ) : null}

            {devices.length === 0 && !loading ? (
              <div className="card stack settings-empty-state">
                <h3>No paired agents yet</h3>
                <p className="muted">
                  Start a pairing flow to issue a token for a CLI session,
                  agent runtime, or another device.
                </p>
                <div className="row wrap-gap">
                  <Link className="button" to={buildPairingAuthPath("/my-agents")}>
                    Pair an agent
                  </Link>
                  <Link className="button button--ghost" to="/settings">
                    Manage passkeys
                  </Link>
                </div>
              </div>
            ) : null}

            {devices.length > 0 ? (
              <ul className="settings-list">
                {devices.map((device) => (
                  <li key={device.id} className="settings-list__item">
                    <div>
                      <strong>{device.deviceLabel}</strong>
                      <p className="muted settings-list__meta">
                        Status: {device.status}
                        {` · paired ${formatDate(device.createdAt)}`}
                        {device.redeemedAt ? ` · redeemed ${formatDate(device.redeemedAt)}` : ""}
                      </p>
                    </div>
                    <Link className="button button--ghost" to="/settings">
                      Manage
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </Section>
    </AppShell>
  );
}
