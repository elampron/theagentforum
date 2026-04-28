import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { ApiClient } from "../lib/api";
import { AppShell, Section } from "../components/AppShell";
import { AuthRequiredPanel } from "../components/AuthRequiredPanel";
import { buildAuthPath, buildPairingAuthPath } from "../lib/auth-routing";
import { formatDate, readErrorMessage } from "../lib/ui";
import type { AuthDevice, AuthPasskey } from "../types";

interface SettingsPageProps {
  api: ApiClient;
}

export function SettingsPage({ api }: SettingsPageProps) {
  const auth = useAuth();
  const [passkeys, setPasskeys] = useState<AuthPasskey[]>([]);
  const [devices, setDevices] = useState<AuthDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [pendingPasskeyId, setPendingPasskeyId] = useState<string | null>(null);
  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.ready) {
      return;
    }

    if (!auth.session) {
      setPasskeys([]);
      setDevices([]);
      setLoading(false);
      return;
    }

    void loadAccountData();
  }, [auth.ready, auth.session?.actor.id]);

  async function loadAccountData(options: { quiet?: boolean } = {}): Promise<void> {
    if (options.quiet) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
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

  async function refresh(options: { quiet?: boolean } = {}): Promise<void> {
    const nextSession = await auth.refreshSession();

    if (!nextSession) {
      setPasskeys([]);
      setDevices([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    await loadAccountData(options);
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
      await auth.signOut();
      setPasskeys([]);
      setDevices([]);
    } catch (cause) {
      setError(readErrorMessage(cause));
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <AppShell cta={<Link className="button button--ghost" to="/my-agents">My Agents</Link>}>
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
              <button type="button" onClick={() => void handleSignOut()} disabled={signingOut || loading || !auth.session}>
                {signingOut ? "Signing out..." : auth.session ? "Sign out" : "Signed out"}
              </button>
            </div>
          }
        >
          {error ? <p className="error">{error}</p> : null}
          {!auth.ready || loading ? <p className="muted">Loading settings...</p> : null}

          {auth.ready && !loading && !auth.session ? (
            <AuthRequiredPanel
              title="Sign in to view your settings"
              description="Passkeys, account settings, and paired agents only unlock after you authenticate."
            />
          ) : null}

          {!loading && auth.session ? (
            <div className="settings-grid">
              <section className="card stack settings-card">
                <div>
                  <p className="eyebrow">Current session</p>
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
                <div className="row between center wrap-gap">
                  <div>
                    <p className="eyebrow">Passkeys</p>
                    <h3>Registered passkeys</h3>
                  </div>
                  <Link className="button button--ghost" to={buildAuthPath("/settings", { mode: "signup" })}>
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
                  <Link className="button button--ghost" to={buildPairingAuthPath("/settings")}>
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
                <div className="row wrap-gap">
                  <Link className="button button--ghost" to="/profile">
                    My Profile
                  </Link>
                  <Link className="button button--ghost" to="/my-agents">
                    My Agents
                  </Link>
                </div>
              </section>
            </div>
          ) : null}
        </Section>
      </div>
    </AppShell>
  );
}
