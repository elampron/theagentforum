import { randomBytes } from "node:crypto";
import type {
  AuthenticationSession,
  CompleteRegistrationVerificationInput,
  PairingSession,
  PasskeyAuthenticationOptions,
  PasskeyRegistrationOptions,
  RedeemPairingInput,
  RegistrationSession,
  StartAuthenticationInput,
  StartRegistrationInput,
} from "@theagentforum/core";
import type {
  AuthStore,
  StoredPasskeyCredential,
  VerifiedPasskeyAuthentication,
  VerifiedPasskeyRegistration,
} from "./auth-store";

interface StoredCredential {
  credentialId: string;
  publicKey: string;
  signCount: number;
  label?: string;
  transports?: string[];
}

interface StoredRegistrationSession {
  id: string;
  handle: string;
  displayName?: string;
  status: RegistrationSession["status"];
  challenge: string;
  verificationMethod?: string;
  passkeyLabel?: string;
  verificationUrl?: string;
  verificationToken?: string;
  createdAt: string;
  expiresAt: string;
  verifiedAt?: string;
  pairing: PairingSession;
}

interface StoredAuthenticationSession {
  id: string;
  handle: string;
  displayName?: string;
  status: AuthenticationSession["status"];
  challenge: string;
  verificationMethod?: string;
  passkeyLabel?: string;
  createdAt: string;
  expiresAt: string;
  verifiedAt?: string;
}

export function createInMemoryAuthStore(): AuthStore {
  const registrationSessions = new Map<string, StoredRegistrationSession>();
  const authenticationSessions = new Map<string, StoredAuthenticationSession>();
  const credentialsByHandle = new Map<string, StoredCredential[]>();
  let registrationSequence = 1;
  let pairingSequence = 1;
  let authenticationSequence = 1;

  async function startRegistration(input: StartRegistrationInput): Promise<RegistrationSession> {
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const pairingExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const id = `ars-${registrationSequence++}`;
    const verificationToken = randomBytes(6).toString("hex");

    const session: StoredRegistrationSession = {
      id,
      handle: input.handle,
      displayName: input.displayName,
      status: "awaiting_verification",
      challenge: createChallenge(),
      verificationToken,
      verificationUrl: `/auth?registration=${verificationToken}`,
      createdAt,
      expiresAt,
      pairing: {
        id: `aps-${pairingSequence++}`,
        code: createPairingCode(),
        status: "waiting_for_verification",
        createdAt,
        expiresAt: pairingExpiresAt,
      },
    };

    registrationSessions.set(session.id, session);
    return cloneRegistrationSession(session);
  }

  async function getRegistrationSession(
    registrationSessionId: string,
  ): Promise<RegistrationSession | null> {
    const session = registrationSessions.get(registrationSessionId);

    if (!session) {
      return null;
    }

    expireRegistrationSessionIfNeeded(session);
    return cloneRegistrationSession(session);
  }

  async function getRegistrationSessionByVerificationToken(
    verificationToken: string,
  ): Promise<RegistrationSession | null> {
    const session = Array.from(registrationSessions.values()).find(
      (candidate) => candidate.verificationToken === verificationToken,
    );

    if (!session) {
      return null;
    }

    expireRegistrationSessionIfNeeded(session);
    return cloneRegistrationSession(session);
  }

  async function getPasskeyRegistrationOptions(
    registrationSessionId: string,
  ): Promise<PasskeyRegistrationOptions | null> {
    const session = registrationSessions.get(registrationSessionId);

    if (!session) {
      return null;
    }

    expireRegistrationSessionIfNeeded(session);

    if (session.status === "expired") {
      return null;
    }

    session.status = "pending_webauthn_registration";

    return {
      registrationSessionId: session.id,
      rp: {
        id: "theagentforum.local",
        name: "TheAgentForum",
      },
      user: {
        id: session.id,
        name: session.handle,
        displayName: session.displayName ?? session.handle,
      },
      challenge: session.challenge,
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      timeout: 60000,
      attestation: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    };
  }

  async function finishPasskeyRegistration(
    input: VerifiedPasskeyRegistration,
  ): Promise<RegistrationSession | null> {
    const session = registrationSessions.get(input.registrationSessionId);

    if (!session) {
      return null;
    }

    expireRegistrationSessionIfNeeded(session);

    if (session.status === "expired") {
      return cloneRegistrationSession(session);
    }

    const verifiedAt = new Date().toISOString();
    const label = input.passkeyLabel?.trim() || `${session.handle} passkey`;
    const credentials = credentialsByHandle.get(session.handle) ?? [];
    const existingCredential = credentials.find((credential) => credential.credentialId === input.credentialId);

    if (existingCredential) {
      existingCredential.publicKey = input.publicKey;
      existingCredential.label = label;
      existingCredential.transports = input.transports;
    } else {
      credentials.push({
        credentialId: input.credentialId,
        publicKey: input.publicKey,
        signCount: 0,
        label,
        transports: input.transports,
      });
    }
    credentialsByHandle.set(session.handle, credentials);

    session.status = "verified";
    session.verificationMethod = input.verificationMethod;
    session.passkeyLabel = label;
    session.verifiedAt = verifiedAt;
    session.pairing.status = "ready_to_pair";

    return cloneRegistrationSession(session);
  }

  async function completeRegistrationVerification(
    registrationSessionId: string,
    input: CompleteRegistrationVerificationInput,
  ): Promise<RegistrationSession | null> {
    const session = registrationSessions.get(registrationSessionId);

    if (!session) {
      return null;
    }

    expireRegistrationSessionIfNeeded(session);

    if (session.status === "expired") {
      return cloneRegistrationSession(session);
    }

    session.status = "verified";
    session.verificationMethod = "manual_internal";
    session.passkeyLabel = input.passkeyLabel.trim();
    session.verifiedAt = new Date().toISOString();
    session.pairing.status = "ready_to_pair";

    return cloneRegistrationSession(session);
  }

  async function redeemPairing(input: RedeemPairingInput): Promise<RegistrationSession | null> {
    const session = Array.from(registrationSessions.values()).find(
      (candidate) => candidate.pairing.code === input.pairingCode,
    );

    if (!session) {
      return null;
    }

    expireRegistrationSessionIfNeeded(session);

    if (session.pairing.status !== "ready_to_pair") {
      return cloneRegistrationSession(session);
    }

    session.pairing.status = "paired";
    session.pairing.deviceLabel = input.deviceLabel;
    session.pairing.token = createToken();
    session.pairing.redeemedAt = new Date().toISOString();

    return cloneRegistrationSession(session);
  }

  async function startAuthentication(
    input: StartAuthenticationInput,
  ): Promise<AuthenticationSession | null> {
    const credentials = (credentialsByHandle.get(input.handle) ?? []).filter(isAuthenticatablePasskey);

    if (credentials.length === 0) {
      return null;
    }

    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const latestRegistration = Array.from(registrationSessions.values())
      .filter((candidate) => candidate.handle === input.handle)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

    const session: StoredAuthenticationSession = {
      id: `aas-${authenticationSequence++}`,
      handle: input.handle,
      displayName: latestRegistration?.displayName,
      status: "awaiting_authentication",
      challenge: createChallenge(),
      createdAt,
      expiresAt,
    };

    authenticationSessions.set(session.id, session);
    return cloneAuthenticationSession(session);
  }

  async function getAuthenticationSession(
    authenticationSessionId: string,
  ): Promise<AuthenticationSession | null> {
    const session = authenticationSessions.get(authenticationSessionId);

    if (!session) {
      return null;
    }

    expireAuthenticationSessionIfNeeded(session);
    return cloneAuthenticationSession(session);
  }

  async function getPasskeyAuthenticationOptions(
    authenticationSessionId: string,
  ): Promise<PasskeyAuthenticationOptions | null> {
    const session = authenticationSessions.get(authenticationSessionId);

    if (!session) {
      return null;
    }

    expireAuthenticationSessionIfNeeded(session);

    if (session.status === "expired") {
      return null;
    }

    const credentials = (credentialsByHandle.get(session.handle) ?? []).filter(isAuthenticatablePasskey);
    if (credentials.length === 0) {
      return null;
    }

    session.status = session.status === "verified" ? session.status : "pending_webauthn_authentication";

    return {
      authenticationSessionId: session.id,
      challenge: session.challenge,
      rpId: "theagentforum.local",
      allowCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        type: "public-key" as const,
        ...(credential.transports && credential.transports.length > 0
          ? { transports: credential.transports }
          : {}),
      })),
      timeout: 60000,
      userVerification: "required",
    };
  }

  async function getPasskeyCredential(
    credentialId: string,
  ): Promise<StoredPasskeyCredential | null> {
    for (const [handle, credentials] of credentialsByHandle.entries()) {
      const credential = credentials.find((candidate) => candidate.credentialId === credentialId);
      if (credential) {
        return {
          handle,
          credentialId: credential.credentialId,
          publicKey: credential.publicKey,
          signCount: credential.signCount,
          label: credential.label,
          transports: credential.transports,
        };
      }
    }

    return null;
  }

  async function finishPasskeyAuthentication(
    input: VerifiedPasskeyAuthentication,
  ): Promise<AuthenticationSession | null> {
    const session = authenticationSessions.get(input.authenticationSessionId);

    if (!session) {
      return null;
    }

    expireAuthenticationSessionIfNeeded(session);

    if (session.status === "expired") {
      return cloneAuthenticationSession(session);
    }

    const credentials = credentialsByHandle.get(session.handle) ?? [];
    const credential = credentials.find((candidate) => candidate.credentialId === input.credentialId);

    if (!credential) {
      return null;
    }

    credential.signCount = input.signCount;
    const verifiedAt = new Date().toISOString();

    session.status = "verified";
    session.verificationMethod = input.verificationMethod;
    session.passkeyLabel = input.passkeyLabel ?? credential.label;
    session.verifiedAt = verifiedAt;

    return cloneAuthenticationSession(session);
  }

  return {
    startRegistration,
    getRegistrationSession,
    getRegistrationSessionByVerificationToken,
    getPasskeyRegistrationOptions,
    finishPasskeyRegistration,
    completeRegistrationVerification,
    redeemPairing,
    startAuthentication,
    getAuthenticationSession,
    getPasskeyAuthenticationOptions,
    getPasskeyCredential,
    finishPasskeyAuthentication,
  };
}

function createChallenge(): string {
  return randomBytes(18).toString("base64url");
}

function createPairingCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

function createToken(): string {
  return `taf_${randomBytes(18).toString("base64url")}`;
}

function expireRegistrationSessionIfNeeded(session: StoredRegistrationSession): void {
  const now = Date.now();

  if (session.status !== "expired" && Date.parse(session.expiresAt) <= now) {
    session.status = "expired";
  }

  if (session.pairing.status !== "paired" && Date.parse(session.pairing.expiresAt) <= now) {
    session.pairing.status = "expired";
  }
}

function expireAuthenticationSessionIfNeeded(session: StoredAuthenticationSession): void {
  if (
    session.status !== "expired"
    && session.status !== "verified"
    && Date.parse(session.expiresAt) <= Date.now()
  ) {
    session.status = "expired";
  }
}

function isAuthenticatablePasskey(credential: StoredCredential): boolean {
  return !credential.credentialId.startsWith("manual-");
}

function cloneRegistrationSession(session: StoredRegistrationSession): RegistrationSession {
  return {
    ...session,
    pairing: { ...session.pairing },
  };
}

function cloneAuthenticationSession(
  session: StoredAuthenticationSession,
): AuthenticationSession {
  return {
    ...session,
  };
}
