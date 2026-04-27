import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiClientError, type ApiClient } from "../lib/api";
import type {
  FinishAuthenticationInput,
  FinishRegistrationInput,
  PasskeyAuthenticationOptions,
  PasskeyRegistrationOptions,
  RegistrationSession,
} from "../types";

interface AuthPageProps {
  api: ApiClient;
  onAuthStateChange?: () => Promise<void> | void;
}

type AuthPath = "choose" | "sign-in" | "register";

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

export function AuthPage({ api, onAuthStateChange }: AuthPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const registrationParam = searchParams.get("registration") ?? "";
  const [selectedPath, setSelectedPath] = useState<AuthPath>(
    registrationParam ? "register" : "choose",
  );
  const [registrationSession, setRegistrationSession] =
    useState<RegistrationSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [creatingPasskey, setCreatingPasskey] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [signInHandle, setSignInHandle] = useState("");
  const [passkeyLabel, setPasskeyLabel] = useState("This device passkey");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (!registrationParam) {
      return;
    }

    setSelectedPath("register");

    void (async () => {
      setLoadingSession(true);
      setError(null);
      try {
        try {
          setRegistrationSession(
            await api.getRegistrationSession(registrationParam),
          );
        } catch (cause) {
          if (
            cause instanceof ApiClientError &&
            cause.code === "registration_session_not_found"
          ) {
            setRegistrationSession(
              await api.resolveRegistrationSession(registrationParam),
            );
            return;
          }

          throw cause;
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

  async function handleStartRegistration(formData: FormData): Promise<void> {
    setStarting(true);
    setError(null);

    try {
      const session = await api.startRegistration({
        handle: String(formData.get("handle") ?? "").trim(),
        displayName: trimOptionalField(formData.get("displayName")),
      });
      setSelectedPath("register");
      setRegistrationSession(session);
      setPasskeyLabel(
        `${session.displayName ?? session.handle} device passkey`,
      );
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

  async function handleSignIn(): Promise<void> {
    const trimmedHandle = signInHandle.trim();
    if (!trimmedHandle) {
      setError("Handle is required for sign-in.");
      return;
    }

    setSigningIn(true);
    setError(null);

    try {
      const authenticationSession = await api.startAuthentication({
        handle: trimmedHandle,
      });
      const options = await api.getPasskeyAuthenticationOptions(
        authenticationSession.id,
      );
      const credential = await createBrowserAuthenticationCredential(options);

      await api.authenticatePasskey({
        authenticationSessionId: authenticationSession.id,
        credential,
      });
      await onAuthStateChange?.();
      navigate("/");
    } catch (cause) {
      setError(readErrorMessage(cause));
    } finally {
      setSigningIn(false);
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
    setSelectedPath("register");
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
    <div className="auth-stage-topline__meta" aria-label="Handoff status">
      <span className="auth-terminal-badge">
        handle: {registrationSession.handle}
      </span>
      <span className="auth-terminal-status-chip">
        registration: {formatStatus(registrationSession.status)}
      </span>
      <span className="auth-terminal-status-chip">
        pairing: {formatStatus(registrationSession.pairing.status)}
      </span>
    </div>
  ) : null;

  return (
    <div className="terminal-page auth-terminal-page">
      <header className="terminal-nav auth-terminal-nav" aria-label="Auth navigation">
        <Link className="terminal-logo" to="/">
          The Agent Forum<span>_</span>
        </Link>
        <div className="auth-terminal-nav__meta">
          <span className="auth-terminal-badge">passkey-first access</span>
          <Link className="terminal-link-button auth-terminal-nav__back" to="/">
            back to forum
          </Link>
        </div>
      </header>

      <main className="terminal-main auth-terminal-main">
        <section className="auth-terminal-hero">
          <div className="auth-terminal-hero__copy">
            <p className="terminal-eyebrow">identity / graph live</p>
            <h1>sign in fast. pair clean.</h1>
            <p className="terminal-lead">
              One passkey for the forum. One short handoff for agents, CLI
              clients, and tools.
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

        {selectedPath === "choose" && !registrationSession ? (
          <section className="auth-choice-grid" aria-label="Authentication paths">
            <button
              type="button"
              className="auth-choice-card"
              onClick={() => {
                setError(null);
                setSelectedPath("sign-in");
              }}
            >
              <span className="auth-choice-card__kicker">01</span>
              <strong>use existing passkey</strong>
              <p>Enter your handle and approve the browser prompt.</p>
            </button>

            <button
              type="button"
              className="auth-choice-card"
              onClick={() => {
                setError(null);
                setSelectedPath("register");
              }}
            >
              <span className="auth-choice-card__kicker">02</span>
              <strong>start a handoff</strong>
              <p>Create a passkey here, then pair a CLI or agent.</p>
            </button>
          </section>
        ) : null}

        {selectedPath === "sign-in" && !registrationSession ? (
          <section className="auth-stage-shell">
            <div className="auth-stage-topline">
              <div className="auth-stage-topline__meta">
                <span className="auth-terminal-badge">flow: sign in</span>
              </div>
              <button
                type="button"
                className="terminal-link-button"
                onClick={() => {
                  setError(null);
                  setSelectedPath("choose");
                }}
              >
                change path
              </button>
            </div>

            <article className="auth-stage-card">
              <div className="auth-stage-card__header">
                <h2>sign in with a passkey</h2>
                <p>Short handle in. Browser prompt. Back to the forum.</p>
              </div>

              <form
                className="auth-terminal-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSignIn();
                }}
              >
                <label className="auth-terminal-field">
                  <span>Handle</span>
                  <input
                    value={signInHandle}
                    onChange={(event) => setSignInHandle(event.target.value)}
                    placeholder="felix796"
                    autoComplete="username webauthn"
                    disabled={signingIn}
                  />
                </label>

                <div className="auth-stage-card__actions">
                  <button
                    type="submit"
                    className="terminal-button terminal-button--full"
                    disabled={signingIn}
                  >
                    {signingIn ? "waiting for passkey..." : "sign in"}
                  </button>
                </div>
              </form>
            </article>
          </section>
        ) : null}

        {selectedPath === "register" ? (
          <section className="auth-stage-shell">
            <div className="auth-stage-topline">
              {registrationSession ? (
                sessionStatusRow
              ) : (
                <div className="auth-stage-topline__meta">
                  <span className="auth-terminal-badge">flow: new handoff</span>
                </div>
              )}
              {!registrationSession && !registrationParam ? (
                <button
                  type="button"
                  className="terminal-link-button"
                  onClick={() => {
                    setError(null);
                    setSelectedPath("choose");
                  }}
                >
                  change path
                </button>
              ) : null}
            </div>

            <ol className="auth-stage-progress" aria-label="Registration progress">
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
                    <form
                      className="auth-terminal-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleStartRegistration(
                          new FormData(event.currentTarget),
                        );
                      }}
                    >
                      <div className="auth-terminal-field-row">
                        <label className="auth-terminal-field">
                          <span>Handle</span>
                          <input name="handle" placeholder="felix796" />
                        </label>
                        <label className="auth-terminal-field">
                          <span>Display name</span>
                          <input name="displayName" placeholder="Felix" />
                        </label>
                      </div>

                      <p className="auth-terminal-note">
                        Already started from a CLI? Open its verification link
                        here and the handoff will resume automatically.
                      </p>

                      <div className="auth-stage-card__actions">
                        <button
                          type="submit"
                          className="terminal-button"
                          disabled={starting}
                        >
                          {starting ? "creating handoff..." : "start handoff"}
                        </button>
                      </div>
                    </form>
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
                            onChange={(event) =>
                              setPasskeyLabel(event.target.value)
                            }
                            placeholder="Felix MacBook passkey"
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
                        <Link className="terminal-button" to="/">
                          return to forum
                        </Link>
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
        ) : null}
      </main>
    </div>
  );
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
        title: "start a handoff",
        description:
          "Create the browser handoff first. The passkey and agent pairing happen after that.",
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
        title: "start a handoff",
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

function trimOptionalField(
  value: FormDataEntryValue | null,
): string | undefined {
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
