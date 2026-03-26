import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiClientError, type ApiClient } from "../lib/api";
import type { RegistrationSession } from "../types";

interface AuthPageProps {
  api: ApiClient;
}

export function AuthPage({ api }: AuthPageProps) {
  const [registrationSession, setRegistrationSession] = useState<RegistrationSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  async function handleStartRegistration(formData: FormData): Promise<void> {
    setStarting(true);
    setError(null);

    try {
      const session = await api.startRegistration({
        handle: String(formData.get("handle") ?? "").trim(),
        displayName: trimOptionalField(formData.get("displayName")),
      });
      setRegistrationSession(session);
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

  async function handleVerify(formData: FormData): Promise<void> {
    if (!registrationSession) {
      return;
    }

    setVerifying(true);
    setError(null);

    try {
      setRegistrationSession(
        await api.completeRegistrationVerification(registrationSession.id, {
          passkeyLabel: String(formData.get("passkeyLabel") ?? "").trim(),
        }),
      );
    } catch (cause) {
      setError(readErrorMessage(cause));
    } finally {
      setVerifying(false);
    }
  }

  async function handleRedeem(formData: FormData): Promise<void> {
    setRedeeming(true);
    setError(null);

    try {
      const pairingCode = String(
        formData.get("pairingCode") ?? registrationSession?.pairing.code ?? "",
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
    <main className="layout">
      <header className="stack">
        <div className="row between center">
          <div>
            <h1>Passkey-first auth</h1>
            <p className="muted">
              MVP registration and pairing slice from issue #17. Real WebAuthn ceremony is still a
              TODO boundary in this pass.
            </p>
          </div>
          <Link to="/">Back to forum</Link>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="card stack">
        <div>
          <h2>1. Start registration</h2>
          <p className="muted">
            Creates a registration session, a passkey challenge placeholder, and a pairing code for
            a future bot or CLI.
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
            {starting ? "Starting..." : "Start registration"}
          </button>
        </form>
      </section>

      {registrationSession ? (
        <>
          <section className="card stack">
            <div className="row between center">
              <div>
                <h2>2. Review session status</h2>
                <p className="muted">
                  Polling is manual for now so the team can inspect the underlying state transitions.
                </p>
              </div>
              <button type="button" onClick={() => void handleRefreshStatus()}>
                Refresh status
              </button>
            </div>

            <dl className="definition-list">
              <div>
                <dt>Registration ID</dt>
                <dd>{registrationSession.id}</dd>
              </div>
              <div>
                <dt>Registration status</dt>
                <dd>{registrationSession.status}</dd>
              </div>
              <div>
                <dt>Challenge</dt>
                <dd>
                  <code>{registrationSession.challenge}</code>
                </dd>
              </div>
              <div>
                <dt>Pairing code</dt>
                <dd>
                  <code>{registrationSession.pairing.code}</code>
                </dd>
              </div>
              <div>
                <dt>Pairing status</dt>
                <dd>{registrationSession.pairing.status}</dd>
              </div>
            </dl>
          </section>

          <section className="card stack">
            <div>
              <h2>3. Record passkey verification</h2>
              <p className="muted">
                TODO: replace this form with real browser WebAuthn registration. For this MVP slice,
                the API records the intended passkey label and moves the session into a verified
                state.
              </p>
            </div>

            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                void handleVerify(new FormData(event.currentTarget));
              }}
            >
              <label className="stack">
                <span>Passkey label</span>
                <input
                  name="passkeyLabel"
                  placeholder="Felix MacBook Passkey"
                  defaultValue={registrationSession.passkeyLabel}
                />
              </label>
              <button
                type="submit"
                disabled={verifying || registrationSession.status !== "awaiting_verification"}
              >
                {verifying ? "Saving..." : "Record passkey verification"}
              </button>
            </form>
          </section>

          <section className="card stack">
            <div>
              <h2>4. Redeem pairing code</h2>
              <p className="muted">
                This is the bot or device handoff step. It only succeeds once the registration
                session is verified.
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
                <input
                  name="pairingCode"
                  defaultValue={registrationSession.pairing.code}
                />
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
          </section>
        </>
      ) : null}
    </main>
  );
}

function trimOptionalField(value: FormDataEntryValue | null): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

function readErrorMessage(cause: unknown): string {
  if (cause instanceof ApiClientError) {
    return cause.message;
  }

  if (cause instanceof Error) {
    return cause.message;
  }

  return "Unexpected error while calling the API.";
}
