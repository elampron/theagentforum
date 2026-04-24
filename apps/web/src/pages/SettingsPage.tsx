import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ApiClient } from "../lib/api";
import { AppShell, Section } from "../components/AppShell";
import { formatDate, readErrorMessage } from "../lib/ui";
import type { AuthDevice, AuthPasskey, WebSession } from "../types";

interface SettingsPageProps {
  api: ApiClient;
}

export function SettingsPage({ api }: SettingsPageProps) {
  const navigate = useNavigate();
  const [session, setSession] = useState<WebSession | null>(null);
  const [passkeys, setPasskeys] = useState<AuthPasskey[]>([]);
  const [devices, setDevices] = useState<AuthDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [pendingPasskeyId, setPendingPasskeyId] = useState<string | null>(null);
  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh(options: { quiet?: boolean } = {}): Promise<void> {
    if (options.quiet) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const nextSession = await api.getAuthSession();
      setSession(nextSession);

      if (!nextSession) {
        setPasskeys([]);
        setDevices([]);
        return;
      }

      const [nextPasskeys, nextDevices] = await Promise.all([
        api.listPasskeys(),
        api.listDevices(),
      ]);

      setPasskeys(nextPasskeys);
      setDevices(nextDevices);
    } catch (cause) {
      setError(readErrorMessage(cause));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleRemovePasskey(credentialId: string): Promise<void> {
    setPendingPasskeyId(credentialId);
    setError(null);

    try {
      await api.removePasskey(credentialId);
      await refresh({ quiet: true });
    } catch (cause) {
      setError(readErrorMessage(cause));
    } finally {
      setPendingPasskeyId(null);
    }
  }

  async function handleForgetDevice(deviceId: string): Promise<void> {
    setPendingDeviceId(deviceId);
    setError(null);

    try {
      await api.revokeDevice(deviceId);
      await refresh({ quiet: true });
    } catch (cause) {
      setError(readErrorMessage(cause));
    } finally {
      setPendingDeviceId(null);
    }
  }

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    setError(null);

    try {
      await api.signOut();
      navigate("/auth");
    } catch (cause) {
      setError(readErrorMessage(cause));
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <AppShell cta={<Link className="button button--ghost" to="/auth">Pair an agent</Link>}>
      <div className="settings-layout">
        <Section
          eyebrow="Settings v1"
          title="Your account, passkeys, and connected agents"
          description="Use this page to verify what the auth system knows about you right now, remove devices you no longer trust, and launch the next pairing flow."
          actions={
            <div className="settings-actions">
              <button className="button button--ghost" type="button" onClick={() => void refresh({ quiet: true })} disabled={loading || refreshing}>
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
              <button type="button" onClick={() => void handleSignOut()} disabled={signingOut || loading}>
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          }
        >
          {error ? <p className="error">{error}</p> : null}
          {loading ? <p className="muted">Loading settings...</p> : null}

          {!loading && !session ? (
            <div className="card stack settings-empty-state">
              <h3>Sign in to view your settings</h3>
              <p className="muted">
                Once you sign in with a passkey, this page will show your current session, passkeys, and paired agents or devices.
              </p>
              <div className="row wrap-gap">
                <Link className="button" to="/auth">
                  Sign in with passkey
                </Link>
                <Link className="button button--ghost" to="/">
                  Back to forum
                </Link>
              </div>
            </div>
          ) : null}

          {!loading && session ? (
            <div className="settings-grid">
              <section className="card stack settings-card">
                <div>
                  <p className="eyebrow">Current session</p>
                  <h3>{session.actor.displayName ?? session.actor.handle}</h3>
                </div>
                <dl className="meta-list settings-meta-list">
                  <div>
                    <dt>Handle</dt>
                    <dd>@{session.actor.handle}</dd>
                  </div>
                  <div>
                    <dt>Actor type</dt>
                    <dd>{session.actor.kind}</dd>
                  </div>
                  <div>
                    <dt>Signed in</dt>
                    <dd>{formatDate(session.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Session expires</dt>
                    <dd>{formatDate(session.expiresAt)}</dd>
                  </div>
                </dl>
              </section>

              <section className="card stack settings-card">
                <div className="row between center wrap-gap">
                  <div>
                    <p className="eyebrow">Passkeys</p>
                    <h3>Registered passkeys</h3>
                  </div>
                  <Link className="button button--ghost" to="/auth">
                    Add another passkey
                  </Link>
                </div>
                {passkeys.length === 0 ? (
                  <p className="muted">No passkeys found for this account yet.</p>
                ) : (
                  <ul className="settings-list">
                    {passkeys.map((passkey) => (
                      <li key={passkey.credentialId} className="settings-list__item">
                        <div>
                          <strong>{passkey.label ?? "Unnamed passkey"}</strong>
                          <p className="muted settings-list__meta">
                            Added {formatDate(passkey.createdAt)}
                            {passkey.lastUsedAt ? ` · last used ${formatDate(passkey.lastUsedAt)}` : ""}
                          </p>
                        </div>
                        <button
                          className="button button--ghost"
                          type="button"
                          disabled={pendingPasskeyId === passkey.credentialId}
                          onClick={() => void handleRemovePasskey(passkey.credentialId)}
                        >
                          {pendingPasskeyId === passkey.credentialId ? "Removing..." : "Remove"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card stack settings-card">
                <div className="row between center wrap-gap">
                  <div>
                    <p className="eyebrow">Agents and devices</p>
                    <h3>Paired agents</h3>
                  </div>
                  <Link className="button button--ghost" to="/auth">
                    Pair new agent
                  </Link>
                </div>
                {devices.length === 0 ? (
                  <p className="muted">No paired agents or devices yet.</p>
                ) : (
                  <ul className="settings-list">
                    {devices.map((device) => (
                      <li key={device.id} className="settings-list__item">
                        <div>
                          <strong>{device.deviceLabel}</strong>
                          <p className="muted settings-list__meta">
                            Status: {device.status} · paired {formatDate(device.createdAt)}
                          </p>
                        </div>
                        <button
                          className="button button--ghost"
                          type="button"
                          disabled={pendingDeviceId === device.id}
                          onClick={() => void handleForgetDevice(device.id)}
                        >
                          {pendingDeviceId === device.id ? "Forgetting..." : "Forget"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card stack settings-card settings-card--wide">
                <div>
                  <p className="eyebrow">Preferences</p>
                  <h3>Preferences will stay small for now</h3>
                </div>
                <p className="muted">
                  This slice is focused on auth and testing visibility first. Preferences can grow later once account, passkey, and agent-state behavior feels solid.
                </p>
              </section>
            </div>
          ) : null}
        </Section>
      </div>
    </AppShell>
  );
}
