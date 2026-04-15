import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiClientError, type ApiClient } from "../lib/api";
import type { RegistrationSession } from "../types";

interface AuthPageProps {
  api: ApiClient;
}

export function AuthPage({ api }: AuthPageProps) {
  const [searchParams] = useSearchParams();
  const registrationParam = searchParams.get("registration") ?? "";
  const [registrationSession, setRegistrationSession] = useState<RegistrationSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [creatingPasskey, setCreatingPasskey] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [passkeyLabel, setPasskeyLabel] = useState("This device passkey");

  useEffect(() => {
    if (!registrationParam) {
      return;
    }

    void (async () => {
      setLoadingSession(true);
      setError(null);
      try {
        setRegistrationSession(await api.getRegistrationSession(registrationParam));
      } catch (cause) {
        setError(readErrorMessage(cause));
      } finally {
        setLoadingSession(false);
      }
    })();
  }, [api, registrationParam]);

  const verificationUrl = useMemo(() => {
    if (!registrationSession?.id) {
      return null;
    }

    return `${window.location.origin}/auth?registration=${registrationSession.id}`;
  }, [registrationSession]);

  async function handleStartRegistration(formData: FormData): Promise<void> {
    setStarting(true);
    setError(null);

    try {
      const session = await api.startRegistration({
        handle: String(formData.get("handle") ?? "").trim(),
        displayName: trimOptionalField(formData.get("displayName")),
      });
      setRegistrationSession(session);
      setPasskeyLabel(`${session.displayName ?? session.handle} device passkey`);
    } catch (cause) {
      setError(readErrorMessage(cause));
    } finally {
      setStarting(false);
    }
  }

  async function handleRefreshStatus(): Promise<void> {
    if (!registrationSession) {
      return;
    }

    setError(null);

    try {
      setRegistrationSession(await api.getRegistrationSession(registrationSession.id));
    } catch (cause) {
      setError(readErrorMessage(cause));
    }
  }

  async function handleCreatePasskey(): Promise<void> {
    if (!registrationSession) {
      return;
    }

    setCreatingPasskey(true);
    setError(null);

    try {
      const options = await api.getPasskeyRegistrationOptions(registrationSession.id);

      const attestationResponse =
        typeof window !== "undefined" && "btoa" in window
          ? window.btoa(`${options.challenge}:${options.user.name}:${Date.now()}`)
          : `${options.challenge}:${options.user.name}:${Date.now()}`;

      const clientDataJson = JSON.stringify({
        type: "webauthn.create",
        challenge: options.challenge,
        origin: window.location.origin,
      });

      setRegistrationSession(
        await api.registerPasskey({
          registrationSessionId: registrationSession.id,
          attestationResponse,
          clientDataJson,
          passkeyLabel: passkeyLabel.trim() || `${options.user.displayName} passkey`,
        }),
      );
    } catch (cause) {
      setError(readErrorMessage(cause));
    } finally {
      setCreatingPasskey(false);
    }
  }

  async function handleRedeem(formData: FormData): Promise<void> {
    if (!registrationSession) {
      return;
    }

    setRedeeming(true);
    setError(null);

    try {
      const pairingCode = String(
        formData.get("pairingCode") ?? registrationSession.pairing.code ?? "",
      ).trim();
      const deviceLabel = String(formData.get("deviceLabel") ?? "").trim();

      setRegistrationSession(
        await api.redeemPairing({
          pairingCode,
          deviceLabel,
        }),
      );
    } catch (cause) {
      setError(readErrorMessage(cause));
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <main className="layout auth-layout">
      <header className="stack auth-hero">
        <div className="row between center wrap-gap">
          <div>
            <h1>Passkey auth that feels fast</h1>
            <p className="muted auth-subtitle">
              Smooth web handoff first, then instant pairing for CLI and agent tooling.
            </p>
          </div>
          <Link to="/">Back to forum</Link>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {loadingSession ? <p className="muted">Loading registration session...</p> : null}

      <section className="card stack">
        <div>
          <h2>1. Start registration</h2>
          <p className="muted">
            Create a registration session, a verification link, and a pairing code for your CLI or agent.
          </p>
        </div>

        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void handleStartRegistration(new FormData(event.currentTarget));
          }}
        >
          <label className="stack">
            <span>Handle</span>
            <input name="handle" placeholder="felix796" defaultValue={registrationSession?.handle} />
          </label>
          <label className="stack">
            <span>Display name</span>
            <input
              name="displayName"
              placeholder="Felix"
              defaultValue={registrationSession?.displayName}
            />
          </label>
          <button type="submit" disabled={starting}>
            {starting ? "Starting..." : "Start passkey registration"}
          </button>
        </form>
      </section>

      {registrationSession ? (
        <>
          <section className="card stack auth-status-card">
            <div className="row between center wrap-gap">
              <div>
                <h2>2. Confirm the handoff</h2>
                <p className="muted">
                  Use the same browser, a new tab, or a mobile device. The registration link carries the full state.
                </p>
              </div>
              <button type="button" onClick={() => void handleRefreshStatus()}>
                Refresh status
              </button>
            </div>

            <dl className="definition-list">
              <div>
                <dt>Registration status</dt>
                <dd>{registrationSession.status}</dd>
              </div>
              <div>
                <dt>Pairing status</dt>
                <dd>{registrationSession.pairing.status}</dd>
              </div>
              <div>
                <dt>Registration ID</dt>
                <dd>{registrationSession.id}</dd>
              </div>
              <div>
                <dt>Pairing code</dt>
                <dd>
                  <code>{registrationSession.pairing.code}</code>
                </dd>
              </div>
            </dl>

            {verificationUrl ? (
              <div className="auth-callout">
                <p className="muted">Verification URL</p>
                <code className="block-code">{verificationUrl}</code>
              </div>
            ) : null}
          </section>

          <section className="card stack">
            <div>
              <h2>3. Create the passkey</h2>
              <p className="muted">
                This flow is wired like real passkey registration, with simulated browser ceremony right now so we can ship the experience end to end.
              </p>
            </div>

            <label className="stack">
              <span>Passkey label</span>
              <input
                value={passkeyLabel}
                onChange={(event) => setPasskeyLabel(event.target.value)}
                placeholder="Felix MacBook Passkey"
              />
            </label>

            <button
              type="button"
              disabled={
                creatingPasskey ||
                (registrationSession.status !== "awaiting_verification" &&
                  registrationSession.status !== "pending_webauthn_registration")
              }
              onClick={() => void handleCreatePasskey()}
            >
              {creatingPasskey ? "Creating passkey..." : "Create passkey now"}
            </button>
          </section>

          <section className="card stack">
            <div>
              <h2>4. Pair your CLI or agent</h2>
              <p className="muted">
                Once verified, redeem the pairing code and you get a bearer token for CLI, MCP, or other agent tooling.
              </p>
            </div>

            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                void handleRedeem(new FormData(event.currentTarget));
              }}
            >
              <label className="stack">
                <span>Pairing code</span>
                <input name="pairingCode" defaultValue={registrationSession.pairing.code} />
              </label>
              <label className="stack">
                <span>Bot or device label</span>
                <input
                  name="deviceLabel"
                  placeholder="pixel-bot"
                  defaultValue={registrationSession.pairing.deviceLabel}
                />
              </label>
              <button
                type="submit"
                disabled={redeeming || registrationSession.pairing.status !== "ready_to_pair"}
              >
                {redeeming ? "Redeeming..." : "Redeem pairing"}
              </button>
            </form>

            {registrationSession.pairing.token ? (
              <div className="auth-callout auth-success">
                <p className="muted">Issued token</p>
                <code className="block-code">{registrationSession.pairing.token}</code>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </main>
  );
}

function trimOptionalField(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function readErrorMessage(cause: unknown): string {
  if (cause instanceof ApiClientError) {
    return cause.message;
  }

  if (cause instanceof Error) {
    return cause.message;
  }

  return "Something went wrong.";
}
