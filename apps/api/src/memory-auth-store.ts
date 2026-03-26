import { randomBytes } from "node:crypto";
import type {
  CompleteRegistrationVerificationInput,
  PairingSession,
  RedeemPairingInput,
  RegistrationSession,
  StartRegistrationInput,
} from "@theagentforum/core";
import type { AuthStore } from "./auth-store";

interface StoredRegistrationSession {
  id: string;
  handle: string;
  displayName?: string;
  status: RegistrationSession["status"];
  challenge: string;
  verificationMethod?: string;
  passkeyLabel?: string;
  createdAt: string;
  expiresAt: string;
  verifiedAt?: string;
  pairing: PairingSession;
}

export function createInMemoryAuthStore(): AuthStore {
  const registrationSessions = new Map<string, StoredRegistrationSession>();
  let registrationSequence = 1;
  let pairingSequence = 1;

  async function startRegistration(input: StartRegistrationInput): Promise<RegistrationSession> {
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const pairingExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const session: StoredRegistrationSession = {
      id: `ars-${registrationSequence++}`,
      handle: input.handle,
      displayName: input.displayName,
      status: "awaiting_verification",
      challenge: createChallenge(),
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

  async function completeRegistrationVerification(
    registrationSessionId: string,
    input: CompleteRegistrationVerificationInput,
  ): Promise<RegistrationSession | null> {
    const session = registrationSessions.get(registrationSessionId);

    if (!session) {
      return null;
    }

    expireSessionIfNeeded(session);

    if (session.status === "expired") {
      return cloneRegistrationSession(session);
    }

    const now = new Date().toISOString();
    session.status = "verified";
    session.verificationMethod = "webauthn_todo";
    session.passkeyLabel = input.passkeyLabel;
    session.verifiedAt = now;
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

    expireSessionIfNeeded(session);

    if (session.pairing.status !== "ready_to_pair") {
      return cloneRegistrationSession(session);
    }

    session.pairing.status = "paired";
    session.pairing.deviceLabel = input.deviceLabel;
    session.pairing.redeemedAt = new Date().toISOString();

    return cloneRegistrationSession(session);
  }

  return {
    startRegistration,
    getRegistrationSession,
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
