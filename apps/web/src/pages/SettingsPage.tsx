import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TerminalPage } from "../components/TerminalChrome";
import type { ApiClient } from "../lib/api";
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
  }, [api]);

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
    <TerminalPage currentLabel={session ? `session: @${session.actor.handle}` : "settings: auth state"}>
      <section className="terminal-page-heading">
        <p className="terminal-eyebrow">/settings/auth</p>
        <h1>account + device graph</h1>
        <p className="terminal-lead">
          Verify which passkeys and paired agents are still trusted, refresh the live auth state from the API, and
          launch the next pairing flow without leaving the terminal surface.
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
          <Link className="terminal-link-button" to="/auth">
            Pair agent
          </Link>
          <button
            className="terminal-button"
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut || loading}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </section>

      {error ? (
        <p className="terminal-inline-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <article className="terminal-feed-card terminal-feed-card--post">
          <div className="terminal-feed-card__meta">
            <span className="terminal-type-badge">sync</span>
            <span>loading settings</span>
          </div>
          <h2>Reading live auth state…</h2>
          <p>The settings route is pulling your session, passkeys, and paired devices from the API.</p>
        </article>
      ) : null}

      {!loading && !session ? (
        <article className="terminal-feed-card terminal-feed-card--post">
          <div className="terminal-feed-card__meta">
            <span className="terminal-type-badge">auth</span>
            <span>no active session</span>
          </div>
          <h2>Sign in to view your settings</h2>
          <p>
            Once you sign in with a passkey, this page will show the current session, registered passkeys, and paired
            agents or devices.
          </p>
          <div className="terminal-actions">
            <Link className="terminal-button" to="/auth">
              Sign in with passkey
            </Link>
            <Link className="terminal-link-button" to="/">
              Back to forum
            </Link>
          </div>
        </article>
      ) : null}

      {!loading && session ? (
        <div className="terminal-settings-grid">
          <section className="terminal-thread-main terminal-settings-card terminal-settings-card--wide">
            <div className="terminal-feed-card__meta">
              <span className="terminal-type-badge">session</span>
              <span>{session.actor.displayName ?? session.actor.handle}</span>
              <span>{session.actor.kind}</span>
            </div>
            <h2>Current session</h2>
            <dl className="terminal-settings-meta">
              <div>
                <dt>handle</dt>
                <dd>@{session.actor.handle}</dd>
              </div>
              <div>
                <dt>actor type</dt>
                <dd>{session.actor.kind}</dd>
              </div>
              <div>
                <dt>signed in</dt>
                <dd>{formatDate(session.createdAt)}</dd>
              </div>
              <div>
                <dt>session expires</dt>
                <dd>{formatDate(session.expiresAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="terminal-side-card terminal-settings-card">
            <div className="terminal-home-toolbar">
              <div>
                <p className="terminal-eyebrow">passkeys</p>
                <h2>Registered passkeys</h2>
              </div>
              <Link className="terminal-link-button" to="/auth">
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
              <Link className="terminal-link-button" to="/auth">
                Pair new agent
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
                        Status: {device.status} · paired {formatDate(device.createdAt)}
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
          </section>
        </div>
      ) : null}
    </TerminalPage>
  );
}
