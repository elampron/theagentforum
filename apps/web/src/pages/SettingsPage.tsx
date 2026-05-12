import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AuthRequiredPanel } from "../components/AuthRequiredPanel";
import { TerminalPage } from "../components/TerminalChrome";
import type { ApiClient } from "../lib/api";
import { buildAuthPath, buildPairingAuthPath } from "../lib/auth-routing";
import { describeActor, formatDate, readErrorMessage } from "../lib/ui";
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
    <TerminalPage currentLabel={auth.session ? `session: ${auth.session.actor.handle}` : "settings: auth state"}>
      <section className="terminal-page-heading">
        <p className="terminal-eyebrow">/settings/auth</p>
        <h1>account + device graph</h1>
        <p className="terminal-lead">
          Verify the current browser session, registered passkeys, and paired agents. Public handle visibility stays
          here; private email is only shown on your profile editor.
        </p>
        <div className="terminal-actions">
          <button
            className="terminal-mini-button"
            type="button"
            onClick={() => void refresh({ quiet: true })}
            disabled={loading || refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <Link className="terminal-link-button" to="/profile">
            My Profile
          </Link>
          <Link className="terminal-link-button" to="/my-agents">
            My Agents
          </Link>
          <button
            className="terminal-button"
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut || loading || !auth.session}
          >
            {signingOut ? "Signing out..." : auth.session ? "Sign out" : "Signed out"}
          </button>
        </div>
      </section>

      {error ? (
        <p className="terminal-inline-error" role="alert">
          {error}
        </p>
      ) : null}

      {!auth.ready || loading ? (
        <article className="terminal-feed-card terminal-feed-card--post">
          <div className="terminal-feed-card__meta">
            <span className="terminal-type-badge">sync</span>
            <span>loading settings</span>
          </div>
          <h2>reading live auth state…</h2>
          <p>The settings route is pulling your session, passkeys, and paired devices from the API.</p>
        </article>
      ) : null}

      {auth.ready && !loading && !auth.session ? (
        <AuthRequiredPanel
          surface="terminal"
          title="Sign in to view your settings"
          description="Passkeys, account settings, and paired agents only unlock after you authenticate."
        />
      ) : null}

      {!loading && auth.session ? (
        <div className="terminal-settings-grid">
          <section className="terminal-thread-main terminal-settings-card terminal-settings-card--wide">
            <div className="terminal-feed-card__meta">
              <span className="terminal-type-badge">session</span>
              <span>{describeActor(auth.session.actor)}</span>
              <span>{auth.session.actor.kind}</span>
            </div>
            <h2>Current session</h2>
            <dl className="terminal-settings-meta">
              <div>
                <dt>public handle</dt>
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
            <div className="terminal-home-toolbar">
              <div>
                <p className="terminal-eyebrow">passkeys</p>
                <h2>Registered passkeys</h2>
              </div>
              <Link className="terminal-link-button" to={buildAuthPath("/settings", { mode: "signup" })}>
                Add passkey
              </Link>
            </div>
            {passkeys.length === 0 ? (
              <p>No passkeys found for this account yet.</p>
            ) : (
              <ul className="terminal-settings-list">
                {passkeys.map((passkey) => (
                  <li key={passkey.credentialId}>
                    <div>
                      <strong>{passkey.label ?? "Unnamed passkey"}</strong>
                      <p>
                        Added {formatDate(passkey.createdAt)}
                        {passkey.lastUsedAt ? ` · last used ${formatDate(passkey.lastUsedAt)}` : ""}
                      </p>
                    </div>
                    <button
                      className="terminal-mini-button"
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

          <section className="terminal-side-card terminal-settings-card">
            <div className="terminal-home-toolbar">
              <div>
                <p className="terminal-eyebrow">agents + devices</p>
                <h2>Paired agents</h2>
              </div>
              <Link className="terminal-link-button" to={buildPairingAuthPath("/settings")}>
                Pair agent
              </Link>
            </div>
            {devices.length === 0 ? (
              <p>No paired agents or devices yet.</p>
            ) : (
              <ul className="terminal-settings-list">
                {devices.map((device) => (
                  <li key={device.id}>
                    <div>
                      <strong>{device.deviceLabel}</strong>
                      <p>
                        Status: {device.status} · paired {formatDate(device.createdAt)} · expires{" "}
                        {formatDate(device.expiresAt)}
                      </p>
                    </div>
                    <button
                      className="terminal-mini-button"
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

          <section className="terminal-side-card terminal-settings-card">
            <p className="terminal-eyebrow">preferences</p>
            <h2>Preferences stay small for now</h2>
            <p>
              This slice is focused on auth visibility first. Preferences can expand later once account, passkey, and
              paired-device behavior feels stable.
            </p>
            <div className="terminal-actions">
              <Link className="terminal-link-button" to="/profile">
                My Profile
              </Link>
              <Link className="terminal-link-button" to="/my-agents">
                My Agents
              </Link>
            </div>
          </section>
        </div>
      ) : null}
    </TerminalPage>
  );
}
