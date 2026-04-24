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

export function AuthPage({ api, onAuthStateChange }: AuthPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const registrationParam = searchParams.get("registration") ?? "";
  const [registrationSession, setRegistrationSession] = useState<RegistrationSession | null>(null);
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

    void (async () => {
      setLoadingSession(true);
      setError(null);
      try {
        try {
          setRegistrationSession(await api.getRegistrationSession(registrationParam));
        } catch (cause) {
          if (cause instanceof ApiClientError && cause.code === "registration_session_not_found") {
            setRegistrationSession(await api.resolveRegistrationSession(registrationParam));
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
    if (!registrationSession?.verificationToken) {
      return null;
    }

    return `${window.location.origin}/auth?registration=${registrationSession.verificationToken}`;
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

  const currentStep = registrationSession
    ? registrationSession.pairing.status === "paired"
      ? 4
      : registrationSession.status === "verified"
        ? 4
        : registrationSession.status === "pending_webauthn_registration"
          ? 3
          : 2
    : 1;

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
      const credential = await createBrowserCredential(options);

      setRegistrationSession(
        await api.registerPasskey({
          registrationSessionId: registrationSession.id,
          credential,
          passkeyLabel: passkeyLabel.trim() || `${options.user.displayName} passkey`,
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
      const options = await api.getPasskeyAuthenticationOptions(authenticationSession.id);
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

  async function copyValue(value: string, field: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 1500);
    } catch {
      setError("Could not copy to clipboard.");
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
          <p className="eyebrow">Returning user</p>
          <h2>Sign in with your passkey</h2>
          <p className="muted">
            Already registered a passkey? Start a sign-in session, approve the browser prompt, and the web session cookie will be issued automatically.
          </p>
        </div>

        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSignIn();
          }}
        >
          <label className="stack">
            <span>Handle for sign-in</span>
            <input
              value={signInHandle}
              onChange={(event) => setSignInHandle(event.target.value)}
              placeholder="felix796"
              disabled={signingIn}
            />
          </label>
          <button type="submit" disabled={signingIn}>
            {signingIn ? "Signing in..." : "Sign in with passkey"}
          </button>
        </form>
      </section>

      <section className="card stack auth-guide-card">
        <div>
          <p className="eyebrow">How this works</p>
          <h2>Browser verifies you, agent gets paired afterward</h2>
          <p className="muted">
            Start in the CLI or here, complete the browser passkey step, then redeem the pairing code to issue an agent token.
          </p>
        </div>

        <ol className="auth-steps" aria-label="Authentication steps">
          <li className={currentStep >= 1 ? "active" : undefined}>Start registration</li>
          <li className={currentStep >= 2 ? "active" : undefined}>Open verification link</li>
          <li className={currentStep >= 3 ? "active" : undefined}>Create passkey</li>
          <li className={currentStep >= 4 ? "active" : undefined}>Redeem pairing for token</li>
        </ol>
      </section>

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

        <p className="field-hint">
          If you already started from the CLI, you can skip this form and just open the verification link you were given.
        </p>
      </section>

      {registrationSession ? (
        <>
          <section className="card stack auth-status-card">
            <div className="row between center wrap-gap">
              <div>
                <h2>2. Confirm the handoff</h2>
                <p className="muted">
                  Open the verification link in any browser. That link is the handoff between CLI and web.
                </p>
              </div>
              <button type="button" onClick={() => void handleRefreshStatus()}>
                Refresh status
              </button>
            </div>

            <div className="auth-callout auth-tip">
              <strong>What you should do next</strong>
              <p className="muted">
                Copy the verification URL, open it in a browser, then click <strong>Create passkey</strong>. Once the status changes to verified, come back and redeem pairing.
              </p>
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
                <div className="row between center wrap-gap">
                  <div>
                    <p className="muted">Verification URL</p>
                    <code className="block-code">{verificationUrl}</code>
                  </div>
                  <button type="button" className="button button--ghost" onClick={() => void copyValue(verificationUrl, "verification-url")}>
                    {copiedField === "verification-url" ? "Copied" : "Copy link"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="status-pills-row" aria-label="Current auth status">
              <span className={`status-chip ${registrationSession.status === "verified" ? "status-chip--done" : ""}`}>
                Registration: {registrationSession.status}
              </span>
              <span className={`status-chip ${registrationSession.pairing.status === "ready_to_pair" || registrationSession.pairing.status === "paired" ? "status-chip--done" : ""}`}>
                Pairing: {registrationSession.pairing.status}
              </span>
            </div>
          </section>

          <section className="card stack">
            <div>
              <h2>3. Create the passkey</h2>
              <p className="muted">
                Click once. If it works, this section should move the registration to <strong>verified</strong> and unlock pairing.
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
              disabled={!canCreatePasskey}
              onClick={() => void handleCreatePasskey()}
            >
              {creatingPasskey ? "Creating passkey..." : "Create passkey now"}
            </button>

            {registrationSession.status === "verified" ? (
              <div className="auth-callout auth-success">
                <strong>Passkey step complete</strong>
                <p className="muted">
                  Nice, the registration is verified. You can redeem the pairing code now.
                </p>
              </div>
            ) : (
              <p className="field-hint">
                Expected result: registration status becomes <strong>verified</strong> and pairing becomes <strong>ready_to_pair</strong>.
              </p>
            )}
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
                disabled={!canRedeemPairing}
              >
                {redeeming ? "Redeeming..." : "Redeem pairing"}
              </button>
            </form>

            {registrationSession.pairing.status !== "ready_to_pair" && registrationSession.pairing.status !== "paired" ? (
              <p className="field-hint">
                Pairing stays locked until the browser passkey step verifies successfully.
              </p>
            ) : null}

            {registrationSession.pairing.token ? (
              <div className="auth-callout auth-success">
                <div className="row between center wrap-gap">
                  <div>
                    <p className="muted">Issued token</p>
                    <code className="block-code">{registrationSession.pairing.token}</code>
                  </div>
                  <button type="button" className="button button--ghost" onClick={() => void copyValue(registrationSession.pairing.token ?? "", "issued-token")}>
                    {copiedField === "issued-token" ? "Copied" : "Copy token"}
                  </button>
                </div>
                <p className="field-hint">This is the token the CLI or MCP client should use next.</p>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </main>
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

  if (!credentials?.create || typeof window.PublicKeyCredential === "undefined") {
    throw new Error("This browser does not support WebAuthn passkey registration.");
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

  if (!created || typeof created !== "object" || !("rawId" in created) || !("response" in created)) {
    throw new Error("Browser passkey registration did not return a public-key credential.");
  }

  const credential = created as BrowserCredentialWithAttestation;
  const response = credential.response;

  if (!response || typeof response !== "object") {
    throw new Error("Browser did not return an attestation response for passkey registration.");
  }

  const publicKey = response.getPublicKey?.() ?? null;
  const publicKeyAlgorithm = response.getPublicKeyAlgorithm?.();
  const transports = response.getTransports?.();

  return {
    id: credential.id,
    rawId: toBase64Url(new Uint8Array(credential.rawId)),
    type: "public-key",
    response: {
      attestationObject: toBase64Url(new Uint8Array(response.attestationObject)),
      clientDataJSON: toBase64Url(new Uint8Array(response.clientDataJSON)),
      ...(publicKey ? { publicKey: toBase64Url(new Uint8Array(publicKey)) } : {}),
      ...(typeof publicKeyAlgorithm === "number" ? { publicKeyAlgorithm } : {}),
      ...(transports && transports.length > 0 ? { transports } : {}),
    },
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    clientExtensionResults: credential.getClientExtensionResults?.() as Record<string, unknown> | undefined,
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

  if (!fetched || typeof fetched !== "object" || !("rawId" in fetched) || !("response" in fetched)) {
    throw new Error("Browser passkey sign-in did not return a public-key credential.");
  }

  const credential = fetched as BrowserCredentialWithAssertion;
  const response = credential.response;

  if (!response || typeof response !== "object") {
    throw new Error("Browser did not return an assertion response for passkey sign-in.");
  }

  return {
    id: credential.id,
    rawId: toBase64Url(new Uint8Array(credential.rawId)),
    type: "public-key",
    response: {
      authenticatorData: toBase64Url(new Uint8Array(response.authenticatorData)),
      clientDataJSON: toBase64Url(new Uint8Array(response.clientDataJSON)),
      signature: toBase64Url(new Uint8Array(response.signature)),
      ...(response.userHandle ? { userHandle: toBase64Url(new Uint8Array(response.userHandle)) } : {}),
    },
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    clientExtensionResults: credential.getClientExtensionResults?.() as Record<string, unknown> | undefined,
  };
}

function decodeMaybeBase64Url(value: string): Uint8Array {
  try {
    return decodeBase64Url(value);
  } catch {
    return new TextEncoder().encode(value);
  }
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
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
