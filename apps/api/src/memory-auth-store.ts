import { randomBytes } from "node:crypto";
import type {
  CompleteRegistrationVerificationInput,
  FinishRegistrationInput,
  PairingSession,
  PasskeyRegistrationOptions,
  RedeemPairingInput,
  RegistrationSession,
  StartRegistrationInput,
} from "@theagentforum/core";
import type { AuthStore } from "./auth-store";

interface StoredCredential {
  credentialId: string;
  publicKey: string;
  label?: string;
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
  createdAt: string;
  expiresAt: string;
  verifiedAt?: string;
  pairing: PairingSession;
}

export function createInMemoryAuthStore(): AuthStore {
  const registrationSessions = new Map<string, StoredRegistrationSession>();
  const credentialsByHandle = new Map<string, StoredCredential[]>();
  let registrationSequence = 1;
  let pairingSequence = 1;

  async function startRegistration(input: StartRegistrationInput): Promise<RegistrationSession> {
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const pairingExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const id = `ars-${registrationSequence++}`;

    const session: StoredRegistrationSession = {
      id,
      handle: input.handle,
      displayName: input.displayName,
      status: "awaiting_verification",
      challenge: createChallenge(),
      verificationUrl: `/auth?registration=${id}`,
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

    expireSessionIfNeeded(session);
    return cloneRegistrationSession(session);
  }

  async function getPasskeyRegistrationOptions(
    registrationSessionId: string,
  ): Promise<PasskeyRegistrationOptions | null> {
    const session = registrationSessions.get(registrationSessionId);

    if (!session) {
      return null;
    }

    expireSessionIfNeeded(session);

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
    input: FinishRegistrationInput,
  ): Promise<RegistrationSession | null> {
    const session = registrationSessions.get(input.registrationSessionId);

    if (!session) {
      return null;
    }

    expireSessionIfNeeded(session);

    if (session.status === "expired") {
      return cloneRegistrationSession(session);
    }

    const verifiedAt = new Date().toISOString();
    const label = input.passkeyLabel?.trim() || `${session.handle} passkey`;
    const credentials = credentialsByHandle.get(session.handle) ?? [];

    credentials.push({
      credentialId: readCredentialId(input.attestationResponse),
      publicKey: input.clientDataJson,
      label,
    });
    credentialsByHandle.set(session.handle, credentials);

    session.status = "verified";
    session.verificationMethod = "webauthn_simulated";
    session.passkeyLabel = label;
    session.verifiedAt = verifiedAt;
    session.pairing.status = "ready_to_pair";

    return cloneRegistrationSession(session);
  }

  async function completeRegistrationVerification(
    registrationSessionId: string,
    input: CompleteRegistrationVerificationInput,
  ): Promise<RegistrationSession | null> {
    return finishPasskeyRegistration({
      registrationSessionId,
      attestationResponse: `manual-${registrationSessionId}`,
      clientDataJson: JSON.stringify({ source: "manual" }),
      passkeyLabel: input.passkeyLabel,
    });
  }

  async function redeemPairing(input: RedeemPairingInput): Promise<RegistrationSession | null> {
    const session = Array.from(registrationSessions.values()).find(
      (candidate) => candidate.pairing.code === input.pairingCode,
    );

    if (!session) {
      return null;
    }

    expireSessionIfNeeded(session);

    if (session.pairing.status !== "ready_to_pair") {
      return cloneRegistrationSession(session);
    }

    session.pairing.status = "paired";
    session.pairing.deviceLabel = input.deviceLabel;
    session.pairing.token = createToken();
    session.pairing.redeemedAt = new Date().toISOString();

    return cloneRegistrationSession(session);
  }

  return {
    startRegistration,
    getRegistrationSession,
    getPasskeyRegistrationOptions,
    finishPasskeyRegistration,
    completeRegistrationVerification,
    redeemPairing,
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

function readCredentialId(attestationResponse: string): string {
  return attestationResponse.trim() || `cred_${randomBytes(8).toString("hex")}`;
}

function expireSessionIfNeeded(session: StoredRegistrationSession): void {
  const now = Date.now();

  if (session.status !== "expired" && Date.parse(session.expiresAt) <= now) {
    session.status = "expired";
  }

  if (session.pairing.status !== "paired" && Date.parse(session.pairing.expiresAt) <= now) {
    session.pairing.status = "expired";
  }
}

function cloneRegistrationSession(session: StoredRegistrationSession): RegistrationSession {
  return {
    ...session,
    pairing: { ...session.pairing },
  };
}
