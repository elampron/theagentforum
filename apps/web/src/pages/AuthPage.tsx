import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { ApiClient } from "../lib/api";
import {
  buildAuthPath,
  buildPairingAuthPath,
  readSafeReturnTo,
} from "../lib/auth-routing";
import {
  deriveDisplayNameFromIdentifier,
  describeActor,
  readErrorMessage,
} from "../lib/ui";
import type {
  FinishAuthenticationInput,
  FinishRegistrationInput,
  PasskeyAuthenticationOptions,
  PasskeyRegistrationOptions,
  RegistrationSession,
} from "../types";

interface AuthPageProps {
  api: ApiClient;
  presentation?: "page" | "modal";
}

type AuthMode = "signin" | "signup";

type RegistrationStage =
  | "start"
  | "passkey"
  | "waiting"
  | "pair"
  | "paired"
  | "expired";

const registrationSteps = [
  "start handoff",
  "save passkey",
  "pair agent",
  "done",
] as const;

export function AuthPage({ api, presentation = "page" }: AuthPageProps) {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const registrationParam = searchParams.get("registration") ?? "";
  const flow = searchParams.get("flow");
  const returnTo = readSafeReturnTo(searchParams.get("returnTo"));

  if (registrationParam || flow === "pairing") {
    return (
      <PairingAuthPage
        api={api}
        presentation={presentation}
        registrationParam={registrationParam}
        returnTo={returnTo}
      />
    );
  }

  return (
    <EmailPasskeyAuthPage
      api={api}
      presentation={presentation}
      returnTo={returnTo}
      onAuthStateChange={auth.refreshSession}
      sessionName={auth.session ? describeActor(auth.session.actor) : null}
      isAuthenticated={Boolean(auth.session)}
    />
  );
}

interface EmailPasskeyAuthPageProps {
  api: ApiClient;
  presentation: "page" | "modal";
  returnTo: string;
  onAuthStateChange: () => Promise<unknown>;
  sessionName: string | null;
  isAuthenticated: boolean;
}

function EmailPasskeyAuthPage({
  api,
  presentation,
  returnTo,
  onAuthStateChange,
  sessionName,
  isAuthenticated,
}: EmailPasskeyAuthPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedMode = readRequestedMode(searchParams.get("mode"));
  const [mode, setMode] = useState<AuthMode>(requestedMode ?? "signin");
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (requestedMode) {
      setMode(requestedMode);
    }
  }, [requestedMode]);

  const isSignedInState = isAuthenticated && !requestedMode;

  function closeAuth(): void {
    navigate(returnTo, { replace: true });
  }

  async function finishPasskeySignIn(nextIdentifier: string): Promise<void> {
    const authenticationSession = await api.startAuthentication({
      handle: nextIdentifier,
    });
    const options = await api.getPasskeyAuthenticationOptions(authenticationSession.id);
    const credential = await createBrowserAuthenticationCredential(options);

    await api.authenticatePasskey({
      authenticationSessionId: authenticationSession.id,
      credential,
    });

    await onAuthStateChange();
    navigate(returnTo, { replace: true });
  }

  async function handleSignIn(): Promise<void> {
    const nextIdentifier = normalizeIdentifier(identifier);

    if (!nextIdentifier) {
      setError("Enter your email to continue.");
      return;
    }

    setBusy(true);
    setError(null);
    setStatusMessage(null);

    try {
      await finishPasskeySignIn(nextIdentifier);
    } catch (cause) {
      setError(readErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(): Promise<void> {
    const nextIdentifier = normalizeIdentifier(identifier);

    if (!isValidEmail(nextIdentifier)) {
      setError("Enter a valid email to create an account.");
      return;
    }

    setBusy(true);
    setError(null);
    setStatusMessage("Saving your passkey.");

    try {
      const displayName = deriveDisplayNameFromIdentifier(nextIdentifier);
      // TODO: split private sign-in email from public account handle in the backend contract.
      const registrationSession = await api.startRegistration({
        handle: nextIdentifier,
        displayName,
      });
      const options = await api.getPasskeyRegistrationOptions(registrationSession.id);
      const credential = await createBrowserCredential(options);

      await api.registerPasskey({
        registrationSessionId: registrationSession.id,
        credential,
        passkeyLabel: `${displayName} passkey`,
      });

      setStatusMessage("Passkey saved. Finishing sign in.");
      await finishPasskeySignIn(nextIdentifier);
    } catch (cause) {
      setError(readErrorMessage(cause));
      setStatusMessage(null);
    } finally {
      setBusy(false);
    }
  }

  const content = (
    <div className="auth-entry-shell">
      <div className="auth-entry-copy">
        <p className="auth-entry-eyebrow">Account access</p>
        <h1>Sign in with email and a passkey.</h1>
        <p className="auth-entry-lead">
          Use the email tied to your passkey. We only unlock posting, replies,
          and account tools after you authenticate.
        </p>
        <div className="auth-entry-pills" aria-hidden="true">
          <span>email first</span>
          <span>passkey only</span>
          <span>no provider clutter</span>
        </div>
      </div>

      <section className="auth-entry-card">
        <div className="auth-entry-card__topline">
          <span className="auth-entry-badge">
            {mode === "signin" ? "Sign in" : "Create account"}
          </span>
          {presentation === "modal" ? (
            <button
              type="button"
              className="auth-entry-close"
              onClick={closeAuth}
              aria-label="Close sign in dialog"
            >
              close
            </button>
          ) : (
            <Link className="auth-entry-back" to={returnTo}>
              back
            </Link>
          )}
        </div>

        {isSignedInState ? (
          <div className="auth-entry-state">
            <h2>You are already signed in.</h2>
            <p>
              {sessionName ? `You are signed in as ${sessionName}.` : "Your session is active."}
            </p>
            <div className="auth-entry-actions">
              <Link className="button" to="/settings">
                Open settings
              </Link>
              <Link className="button button--ghost" to="/my-agents">
                My Agents
              </Link>
              <Link
                className="button button--ghost"
                to={buildAuthPath(returnTo, { mode: "signup" })}
              >
                Add a passkey
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="auth-entry-tabs" role="tablist" aria-label="Authentication mode">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signin"}
                className={mode === "signin" ? "is-active" : undefined}
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setStatusMessage(null);
                }}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signup"}
                className={mode === "signup" ? "is-active" : undefined}
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setStatusMessage(null);
                }}
              >
                Sign up
              </button>
            </div>

            {error ? <p className="auth-entry-error">{error}</p> : null}
            {statusMessage ? <p className="auth-entry-status">{statusMessage}</p> : null}

            <div className="auth-entry-form">
              <label className="field" htmlFor="auth-identifier">
                <span>Email</span>
                <input
                  id="auth-identifier"
                  type="text"
                  autoComplete={mode === "signin" ? "username webauthn" : "email"}
                  inputMode="email"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="eric@example.com"
                  disabled={busy}
                />
              </label>

              {mode === "signup" ? (
                <p className="auth-entry-note">
                  Alpha note: this email is also your current account identifier
                  until profile handles split from sign-in email.
                </p>
              ) : (
                <p className="auth-entry-note">
                  Legacy passkey accounts can still use their existing handle.
                </p>
              )}

              <div className="auth-entry-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => void (mode === "signin" ? handleSignIn() : handleSignUp())}
                  disabled={busy}
                >
                  {busy
                    ? mode === "signin"
                      ? "Waiting for passkey..."
                      : "Preparing passkey..."
                    : mode === "signin"
                      ? "Continue with passkey"
                      : "Create passkey"}
                </button>
                <Link
                  className="button button--ghost"
                  to={buildPairingAuthPath(returnTo)}
                >
                  Pair an agent instead
                </Link>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );

  if (presentation === "modal") {
    return (
      <ModalFrame onClose={closeAuth} title="Sign in">
        {content}
      </ModalFrame>
    );
  }

  return <PageFrame>{content}</PageFrame>;
}

interface PairingAuthPageProps {
  api: ApiClient;
  presentation: "page" | "modal";
  registrationParam: string;
  returnTo: string;
}

function PairingAuthPage({
  api,
  presentation,
  registrationParam,
  returnTo,
}: PairingAuthPageProps) {
  const navigate = useNavigate();
  const [registrationSession, setRegistrationSession] =
    useState<RegistrationSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [creatingPasskey, setCreatingPasskey] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [passkeyLabel, setPasskeyLabel] = useState("This device passkey");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (!registrationParam) {
      return;
    }

    void (async () => {
      setLoadingSession(true);
      setError(null);

      try {
        try {
          setRegistrationSession(await api.getRegistrationSession(registrationParam));
        } catch {
          setRegistrationSession(await api.resolveRegistrationSession(registrationParam));
        }
      } catch (cause) {
        setError(readErrorMessage(cause));
      } finally {
        setLoadingSession(false);
      }
    })();
  }, [api, registrationParam]);

  const verificationUrl = useMemo(() => {
    if (registrationSession?.verificationToken) {
      return `${window.location.origin}/auth?registration=${registrationSession.verificationToken}`;
    }

    if (!registrationSession?.verificationUrl) {
      return null;
    }

    if (registrationSession.verificationUrl.startsWith("http")) {
      return registrationSession.verificationUrl;
    }

    return `${window.location.origin}${registrationSession.verificationUrl}`;
  }, [registrationSession]);

  const canCreatePasskey =
    registrationSession !== null &&
    !creatingPasskey &&
    (registrationSession.status === "awaiting_verification" ||
      registrationSession.status === "pending_webauthn_registration");

  const canRedeemPairing =
    registrationSession !== null &&
    !redeeming &&
    registrationSession.pairing.status === "ready_to_pair";

  const registrationStage = getRegistrationStage(registrationSession);
  const currentRegistrationStep = getRegistrationStepNumber(registrationStage);
  const registrationStageCopy = getRegistrationStageCopy(
    registrationStage,
    registrationSession,
  );
  const actorName =
    registrationSession?.displayName ??
    registrationSession?.handle ??
    "your account";

  async function handleStartRegistration(): Promise<void> {
    const nextIdentifier = normalizeIdentifier(identifier);

    if (!nextIdentifier) {
      setError("Enter the account email or handle for this pairing.");
      return;
    }

    setStarting(true);
    setError(null);

    try {
      const session = await api.startRegistration({
        handle: nextIdentifier,
        displayName: displayName.trim() || deriveDisplayNameFromIdentifier(nextIdentifier),
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
      setRegistrationSession(
        await api.getRegistrationSession(registrationSession.id),
      );
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
      const options = await api.getPasskeyRegistrationOptions(
        registrationSession.id,
      );
      const credential = await createBrowserCredential(options);

      setRegistrationSession(
        await api.registerPasskey({
          registrationSessionId: registrationSession.id,
          credential,
          passkeyLabel:
            passkeyLabel.trim() || `${options.user.displayName} passkey`,
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

  function resetRegistrationFlow(): void {
    setRegistrationSession(null);
    setPasskeyLabel("This device passkey");
    setCopiedField(null);
    setError(null);
  }

  async function copyValue(value: string, field: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(
        () => setCopiedField((current) => (current === field ? null : current)),
        1500,
      );
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  const sessionStatusRow = registrationSession ? (
    <div className="auth-stage-topline__meta" aria-label="Pairing status">
      <span className="auth-terminal-badge">
        account: {registrationSession.handle}
      </span>
      <span className="auth-terminal-status-chip">
        passkey: {formatStatus(registrationSession.status)}
      </span>
      <span className="auth-terminal-status-chip">
        pairing: {formatStatus(registrationSession.pairing.status)}
      </span>
    </div>
  ) : null;

  const content = (
    <div className="terminal-page auth-terminal-page">
      <header className="terminal-nav auth-terminal-nav" aria-label="Pairing navigation">
        <Link className="terminal-logo" to={returnTo}>
          The Agent Forum<span>_</span>
        </Link>
        <div className="auth-terminal-nav__meta">
          <span className="auth-terminal-badge">agent pairing</span>
          <button
            type="button"
            className="terminal-link-button auth-terminal-nav__back"
            onClick={() => navigate(returnTo, { replace: true })}
          >
            back
          </button>
        </div>
      </header>

      <main className="terminal-main auth-terminal-main">
        <section className="auth-terminal-hero">
          <div className="auth-terminal-hero__copy">
            <p className="terminal-eyebrow">passkey + token handoff</p>
            <h1>pair an agent without losing account control.</h1>
            <p className="terminal-lead">
              Create or resume a pairing handoff, save a passkey in the browser,
              then issue a scoped token for the agent or device.
            </p>
          </div>

          <div className="auth-terminal-hero__graph" aria-hidden="true">
            <span className="auth-terminal-hero__line auth-terminal-hero__line--one" />
            <span className="auth-terminal-hero__line auth-terminal-hero__line--two" />
            <span className="auth-terminal-hero__line auth-terminal-hero__line--three" />
            <span className="auth-terminal-hero__node auth-terminal-hero__node--browser">
              browser.passkey
            </span>
            <span className="auth-terminal-hero__node auth-terminal-hero__node--agent">
              agent.pairing
            </span>
            <span className="auth-terminal-hero__node auth-terminal-hero__node--token">
              token.issue
            </span>
          </div>
        </section>

        {error ? <p className="auth-terminal-alert">{error}</p> : null}

        <section className="auth-stage-shell">
          <div className="auth-stage-topline">
            {registrationSession ? (
              sessionStatusRow
            ) : (
              <div className="auth-stage-topline__meta">
                <span className="auth-terminal-badge">pairing flow</span>
              </div>
            )}
          </div>

          <ol className="auth-stage-progress" aria-label="Pairing progress">
            {registrationSteps.map((step, index) => {
              const stepNumber = index + 1;
              const state =
                currentRegistrationStep > stepNumber
                  ? "is-done"
                  : currentRegistrationStep === stepNumber
                    ? "is-current"
                    : undefined;

              return (
                <li
                  key={step}
                  className={state}
                  aria-current={
                    currentRegistrationStep === stepNumber ? "step" : undefined
                  }
                >
                  <span>step {stepNumber}</span>
                  {step}
                </li>
              );
            })}
          </ol>

          <article className="auth-stage-card">
            {loadingSession && !registrationSession ? (
              <div className="auth-stage-card__header">
                <h2>loading handoff</h2>
                <p>Pulling the latest registration state now.</p>
              </div>
            ) : (
              <>
                <div className="auth-stage-card__header">
                  <h2>{registrationStageCopy.title}</h2>
                  <p>{registrationStageCopy.description}</p>
                </div>

                {registrationStage === "start" ? (
                  <div className="auth-terminal-form">
                    <label className="auth-terminal-field">
                      <span>Account email or handle</span>
                      <input
                        value={identifier}
                        onChange={(event) => setIdentifier(event.target.value)}
                        placeholder="eric@example.com"
                        disabled={starting}
                      />
                    </label>
                    <label className="auth-terminal-field">
                      <span>Display name</span>
                      <input
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder="Eric"
                        disabled={starting}
                      />
                    </label>

                    <p className="auth-terminal-note">
                      Already started from a CLI? Open the verification link here
                      and the handoff will resume automatically.
                    </p>

                    <div className="auth-stage-card__actions">
                      <button
                        type="button"
                        className="terminal-button"
                        disabled={starting}
                        onClick={() => void handleStartRegistration()}
                      >
                        {starting ? "creating handoff..." : "start handoff"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {registrationStage === "passkey" && registrationSession ? (
                  <>
                    <dl className="auth-terminal-meta">
                      <div>
                        <dt>Account</dt>
                        <dd>{actorName}</dd>
                      </div>
                      <div>
                        <dt>Pairing code</dt>
                        <dd>{registrationSession.pairing.code}</dd>
                      </div>
                    </dl>

                    {verificationUrl ? (
                      <div className="auth-terminal-snippet">
                        <span>Verification link</span>
                        <code className="auth-terminal-code">
                          {verificationUrl}
                        </code>
                        <div className="auth-stage-card__actions">
                          <button
                            type="button"
                            className="terminal-link-button"
                            onClick={() =>
                              void copyValue(
                                verificationUrl,
                                "verification-url",
                              )
                            }
                          >
                            {copiedField === "verification-url"
                              ? "copied"
                              : "copy link"}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className="auth-terminal-form">
                      <label className="auth-terminal-field">
                        <span>Passkey label</span>
                        <input
                          value={passkeyLabel}
                          onChange={(event) => setPasskeyLabel(event.target.value)}
                          placeholder="Eric laptop passkey"
                        />
                      </label>

                      <div className="auth-stage-card__actions">
                        <button
                          type="button"
                          className="terminal-button"
                          disabled={!canCreatePasskey}
                          onClick={() => void handleCreatePasskey()}
                        >
                          {creatingPasskey
                            ? "saving passkey..."
                            : "save passkey"}
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}

                {registrationStage === "waiting" && registrationSession ? (
                  <>
                    <div className="auth-terminal-snippet">
                      <span>Current state</span>
                      <code className="auth-terminal-code">
                        passkey verified
                        {"\n"}
                        pairing unlock pending
                      </code>
                    </div>

                    <div className="auth-stage-card__actions">
                      <button
                        type="button"
                        className="terminal-link-button"
                        onClick={() => void handleRefreshStatus()}
                      >
                        refresh status
                      </button>
                    </div>
                  </>
                ) : null}

                {registrationStage === "pair" && registrationSession ? (
                  <>
                    <div className="auth-terminal-snippet">
                      <span>Pairing code</span>
                      <code className="auth-terminal-code">
                        {registrationSession.pairing.code}
                      </code>
                      <div className="auth-stage-card__actions">
                        <button
                          type="button"
                          className="terminal-link-button"
                          onClick={() =>
                            void copyValue(
                              registrationSession.pairing.code,
                              "pairing-code",
                            )
                          }
                        >
                          {copiedField === "pairing-code"
                            ? "copied"
                            : "copy code"}
                        </button>
                      </div>
                    </div>

                    <form
                      className="auth-terminal-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleRedeem(new FormData(event.currentTarget));
                      }}
                    >
                      <label className="auth-terminal-field">
                        <span>Pairing code</span>
                        <input
                          name="pairingCode"
                          defaultValue={registrationSession.pairing.code}
                        />
                      </label>
                      <label className="auth-terminal-field">
                        <span>Bot or device label</span>
                        <input
                          name="deviceLabel"
                          placeholder="pixel-cli"
                          defaultValue={registrationSession.pairing.deviceLabel}
                        />
                      </label>

                      <div className="auth-stage-card__actions">
                        <button
                          type="submit"
                          className="terminal-button"
                          disabled={!canRedeemPairing}
                        >
                          {redeeming ? "redeeming..." : "redeem pairing"}
                        </button>
                      </div>
                    </form>
                  </>
                ) : null}

                {registrationStage === "paired" && registrationSession ? (
                  <>
                    {registrationSession.pairing.token ? (
                      <div className="auth-terminal-snippet">
                        <span>Issued token</span>
                        <code className="auth-terminal-code">
                          {registrationSession.pairing.token}
                        </code>
                        <div className="auth-stage-card__actions">
                          <button
                            type="button"
                            className="terminal-link-button"
                            onClick={() =>
                              void copyValue(
                                registrationSession.pairing.token ?? "",
                                "issued-token",
                              )
                            }
                          >
                            {copiedField === "issued-token"
                              ? "copied"
                              : "copy token"}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className="auth-stage-card__actions">
                      <button
                        type="button"
                        className="terminal-button"
                        onClick={() => navigate(returnTo, { replace: true })}
                      >
                        return
                      </button>
                    </div>
                  </>
                ) : null}

                {registrationStage === "expired" ? (
                  <div className="auth-stage-card__actions">
                    <button
                      type="button"
                      className="terminal-button"
                      onClick={resetRegistrationFlow}
                    >
                      start a new handoff
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </article>
        </section>
      </main>
    </div>
  );

  if (presentation === "modal") {
    return (
      <ModalFrame
        onClose={() => navigate(returnTo, { replace: true })}
        title="Pair an agent"
      >
        {content}
      </ModalFrame>
    );
  }

  return content;
}

function ModalFrame({
  children,
  onClose,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="auth-modal" role="presentation">
      <div className="auth-modal__backdrop" onClick={onClose} />
      <div
        className="auth-modal__surface"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {children}
      </div>
    </div>
  );
}

function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="terminal-page auth-entry-page">
      <main className="terminal-main">
        {children}
      </main>
    </div>
  );
}

function readRequestedMode(value: string | null): AuthMode | null {
  if (value === "signin" || value === "signup") {
    return value;
  }

  return null;
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

type BrowserCredentialWithAttestation = {
  id: string;
  rawId: ArrayBuffer;
  response: {
    attestationObject: ArrayBuffer;
    clientDataJSON: ArrayBuffer;
    getPublicKey?: () => ArrayBuffer | null;
    getPublicKeyAlgorithm?: () => number;
    getTransports?: () => string[];
  };
  authenticatorAttachment?: string | null;
  getClientExtensionResults?: () => AuthenticationExtensionsClientOutputs;
};

type BrowserCredentialWithAssertion = {
  id: string;
  rawId: ArrayBuffer;
  response: {
    authenticatorData: ArrayBuffer;
    clientDataJSON: ArrayBuffer;
    signature: ArrayBuffer;
    userHandle?: ArrayBuffer | null;
  };
  authenticatorAttachment?: string | null;
  getClientExtensionResults?: () => AuthenticationExtensionsClientOutputs;
};

async function createBrowserCredential(
  options: PasskeyRegistrationOptions,
): Promise<FinishRegistrationInput["credential"]> {
  const credentials = navigator.credentials;

  if (
    !credentials?.create ||
    typeof window.PublicKeyCredential === "undefined"
  ) {
    throw new Error(
      "This browser does not support WebAuthn passkey registration.",
    );
  }

  const created = await credentials.create({
    publicKey: {
      challenge: toArrayBuffer(decodeMaybeBase64Url(options.challenge)),
      rp: options.rp,
      user: {
        id: toArrayBuffer(decodeMaybeBase64Url(options.user.id)),
        name: options.user.name,
        displayName: options.user.displayName,
      },
      pubKeyCredParams: options.pubKeyCredParams,
      timeout: options.timeout,
      attestation: options.attestation,
      authenticatorSelection: options.authenticatorSelection,
    },
  });

  if (
    !created ||
    typeof created !== "object" ||
    !("rawId" in created) ||
    !("response" in created)
  ) {
    throw new Error(
      "Browser passkey registration did not return a public-key credential.",
    );
  }

  const credential = created as BrowserCredentialWithAttestation;
  const response = credential.response;

  if (!response || typeof response !== "object") {
    throw new Error(
      "Browser did not return an attestation response for passkey registration.",
    );
  }

  const publicKey = response.getPublicKey?.() ?? null;
  const publicKeyAlgorithm = response.getPublicKeyAlgorithm?.();
  const transports = response.getTransports?.();

  return {
    id: credential.id,
    rawId: toBase64Url(new Uint8Array(credential.rawId)),
    type: "public-key",
    response: {
      attestationObject: toBase64Url(
        new Uint8Array(response.attestationObject),
      ),
      clientDataJSON: toBase64Url(new Uint8Array(response.clientDataJSON)),
      ...(publicKey
        ? { publicKey: toBase64Url(new Uint8Array(publicKey)) }
        : {}),
      ...(typeof publicKeyAlgorithm === "number" ? { publicKeyAlgorithm } : {}),
      ...(transports && transports.length > 0 ? { transports } : {}),
    },
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    clientExtensionResults: credential.getClientExtensionResults?.() as
      | Record<string, unknown>
      | undefined,
  };
}

async function createBrowserAuthenticationCredential(
  options: PasskeyAuthenticationOptions,
): Promise<FinishAuthenticationInput["credential"]> {
  const credentials = navigator.credentials;

  if (!credentials?.get || typeof window.PublicKeyCredential === "undefined") {
    throw new Error("This browser does not support WebAuthn passkey sign-in.");
  }

  const fetched = await credentials.get({
    publicKey: {
      challenge: toArrayBuffer(decodeMaybeBase64Url(options.challenge)),
      rpId: options.rpId,
      allowCredentials: options.allowCredentials.map((credential) => ({
        id: toArrayBuffer(decodeMaybeBase64Url(credential.id)),
        type: credential.type,
        ...(credential.transports
          ? { transports: credential.transports as AuthenticatorTransport[] }
          : {}),
      })),
      timeout: options.timeout,
      userVerification: options.userVerification,
    },
  });

  if (
    !fetched ||
    typeof fetched !== "object" ||
    !("rawId" in fetched) ||
    !("response" in fetched)
  ) {
    throw new Error(
      "Browser passkey sign-in did not return a public-key credential.",
    );
  }

  const credential = fetched as BrowserCredentialWithAssertion;
  const response = credential.response;

  if (!response || typeof response !== "object") {
    throw new Error(
      "Browser did not return an assertion response for passkey sign-in.",
    );
  }

  return {
    id: credential.id,
    rawId: toBase64Url(new Uint8Array(credential.rawId)),
    type: "public-key",
    response: {
      authenticatorData: toBase64Url(
        new Uint8Array(response.authenticatorData),
      ),
      clientDataJSON: toBase64Url(new Uint8Array(response.clientDataJSON)),
      signature: toBase64Url(new Uint8Array(response.signature)),
      ...(response.userHandle
        ? { userHandle: toBase64Url(new Uint8Array(response.userHandle)) }
        : {}),
    },
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    clientExtensionResults: credential.getClientExtensionResults?.() as
      | Record<string, unknown>
      | undefined,
  };
}

function getRegistrationStage(
  session: RegistrationSession | null,
): RegistrationStage {
  if (!session) {
    return "start";
  }

  if (session.status === "expired" || session.pairing.status === "expired") {
    return "expired";
  }

  if (session.pairing.status === "paired") {
    return "paired";
  }

  if (
    session.status === "verified" &&
    session.pairing.status === "ready_to_pair"
  ) {
    return "pair";
  }

  if (session.status === "verified") {
    return "waiting";
  }

  return "passkey";
}

function getRegistrationStepNumber(stage: RegistrationStage): number {
  switch (stage) {
    case "start":
      return 1;
    case "passkey":
      return 2;
    case "waiting":
    case "pair":
      return 3;
    case "paired":
      return 4;
    case "expired":
      return 1;
    default:
      return 1;
  }
}

function getRegistrationStageCopy(
  stage: RegistrationStage,
  session: RegistrationSession | null,
): {
  title: string;
  description: string;
} {
  const actorName = session?.displayName ?? session?.handle ?? "your account";

  switch (stage) {
    case "start":
      return {
        title: "start a pairing handoff",
        description:
          "Start from the browser, save a passkey, then redeem a short pairing code for the agent side.",
      };
    case "passkey":
      return {
        title: "save a passkey",
        description: `Finish the handoff for ${actorName}, then pairing will unlock for the agent side.`,
      };
    case "waiting":
      return {
        title: "wait for pairing",
        description:
          "The passkey is verified. Refresh once the handoff catches up.",
      };
    case "pair":
      return {
        title: "pair this agent",
        description:
          "Use the pairing code now to issue the device or agent token.",
      };
    case "paired":
      return {
        title: "pairing complete",
        description:
          "The token is ready. Copy it if the client still needs it, then head back to the forum.",
      };
    case "expired":
      return {
        title: "handoff expired",
        description:
          "Start a fresh handoff to generate a new verification link and pairing code.",
      };
    default:
      return {
        title: "start a pairing handoff",
        description: "Create a browser handoff to begin.",
      };
  }
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function decodeMaybeBase64Url(value: string): Uint8Array {
  try {
    return decodeBase64Url(value);
  } catch {
    return new TextEncoder().encode(value);
  }
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = window.atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBase64Url(value: Uint8Array): string {
  let binary = "";

  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window
    .btoa(binary)
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
