import { createHash, timingSafeEqual } from "node:crypto";
import type {
  FinishRegistrationInput,
  RegistrationSession,
  WebAuthnCredentialPayload,
} from "@theagentforum/core";
import type { VerifiedPasskeyRegistration } from "./auth-store";

interface WebAuthnVerificationContext {
  registrationSession: RegistrationSession;
  expectedOrigin: string;
  expectedRpId: string;
}

interface AuthenticatorData {
  rpIdHash: Buffer;
  flags: number;
  signCount: number;
  credentialId: Buffer;
  credentialPublicKey: Buffer;
}

export class WebAuthnVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebAuthnVerificationError";
  }
}

export function verifyPasskeyRegistration(
  input: FinishRegistrationInput,
  context: WebAuthnVerificationContext,
): VerifiedPasskeyRegistration {
  const credential = input.credential;

  if (credential.type !== "public-key") {
    throw new WebAuthnVerificationError("credential.type must be public-key.");
  }

  const rawIdBytes = decodeBase64Url(credential.rawId, "credential.rawId");
  const credentialIdBytes = decodeBase64Url(credential.id, "credential.id");
  assertBuffersEqual(rawIdBytes, credentialIdBytes, "credential.id must match credential.rawId.");

  const clientData = parseClientData(credential.response.clientDataJSON);

  if (clientData.type !== "webauthn.create") {
    throw new WebAuthnVerificationError("clientDataJSON.type must be webauthn.create.");
  }

  if (clientData.challenge !== context.registrationSession.challenge) {
    throw new WebAuthnVerificationError("clientDataJSON.challenge does not match the pending registration challenge.");
  }

  const expectedOrigin = normalizeOrigin(context.expectedOrigin);
  const observedOrigin = normalizeOrigin(clientData.origin);

  if (observedOrigin !== expectedOrigin) {
    throw new WebAuthnVerificationError("clientDataJSON.origin does not match the browser origin that submitted this request.");
  }

  const attestationObject = parseAttestationObject(credential.response.attestationObject);
  const authenticatorData = parseAuthenticatorData(attestationObject.authData);

  assertBuffersEqual(
    authenticatorData.rpIdHash,
    sha256(context.expectedRpId),
    "authenticatorData.rpIdHash does not match the expected RP ID.",
  );

  if ((authenticatorData.flags & 0x01) === 0) {
    throw new WebAuthnVerificationError("authenticatorData must indicate user presence.");
  }

  if ((authenticatorData.flags & 0x40) === 0) {
    throw new WebAuthnVerificationError("authenticatorData is missing attested credential data.");
  }

  assertBuffersEqual(
    authenticatorData.credentialId,
    rawIdBytes,
    "attested credential ID does not match credential.rawId.",
  );

  const publicKey = credential.response.publicKey
    ? encodeDecodedBase64Url(credential.response.publicKey, "credential.response.publicKey")
    : toBase64Url(authenticatorData.credentialPublicKey);

  return {
    registrationSessionId: input.registrationSessionId,
    credentialId: toBase64Url(rawIdBytes),
    publicKey,
    verificationMethod: "webauthn",
    passkeyLabel: input.passkeyLabel,
    transports: credential.response.transports,
  };
}

function parseClientData(clientDataJsonBase64Url: string): {
  type: string;
  challenge: string;
  origin: string;
} {
  const clientDataJsonBytes = decodeBase64Url(
    clientDataJsonBase64Url,
    "credential.response.clientDataJSON",
  );
  let parsed: unknown;

  try {
    parsed = JSON.parse(clientDataJsonBytes.toString("utf8"));
  } catch {
    throw new WebAuthnVerificationError("credential.response.clientDataJSON must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new WebAuthnVerificationError("credential.response.clientDataJSON must decode to an object.");
  }

  const clientData = parsed as Record<string, unknown>;
  const type = readRequiredString(clientData.type, "clientDataJSON.type");
  const challenge = readRequiredString(clientData.challenge, "clientDataJSON.challenge");
  const origin = readRequiredString(clientData.origin, "clientDataJSON.origin");

  return { type, challenge, origin };
}

function parseAttestationObject(attestationObjectBase64Url: string): { authData: Buffer } {
  const attestationObjectBytes = decodeBase64Url(
    attestationObjectBase64Url,
    "credential.response.attestationObject",
  );
  const decoded = decodeCbor(attestationObjectBytes);

  if (decoded.bytesRead !== attestationObjectBytes.length) {
    throw new WebAuthnVerificationError("credential.response.attestationObject contains trailing CBOR data.");
  }

  if (!decoded.value || typeof decoded.value !== "object" || Array.isArray(decoded.value)) {
    throw new WebAuthnVerificationError("credential.response.attestationObject must decode to a CBOR map.");
  }

  const authData = (decoded.value as Record<string, unknown>).authData;

  if (!Buffer.isBuffer(authData)) {
    throw new WebAuthnVerificationError("credential.response.attestationObject.authData is missing.");
  }

  return { authData };
}

function parseAuthenticatorData(authData: Buffer): AuthenticatorData {
  if (authData.length < 55) {
    throw new WebAuthnVerificationError("authenticatorData is too short.");
  }

  const rpIdHash = authData.subarray(0, 32);
  const flags = authData[32] ?? 0;
  const signCount = authData.readUInt32BE(33);
  const credentialIdLength = authData.readUInt16BE(53);
  const credentialIdStart = 55;
  const credentialIdEnd = credentialIdStart + credentialIdLength;

  if (authData.length < credentialIdEnd) {
    throw new WebAuthnVerificationError("authenticatorData is truncated before the credential ID.");
  }

  const credentialId = authData.subarray(credentialIdStart, credentialIdEnd);
  const credentialPublicKeyItem = decodeCbor(authData, credentialIdEnd);
  const credentialPublicKeyStart = credentialIdEnd;
  const credentialPublicKeyEnd = credentialPublicKeyStart + credentialPublicKeyItem.bytesRead;

  if (credentialPublicKeyItem.bytesRead <= 0 || authData.length < credentialPublicKeyEnd) {
    throw new WebAuthnVerificationError("authenticatorData is missing a credential public key.");
  }

  const credentialPublicKey = authData.subarray(credentialPublicKeyStart, credentialPublicKeyEnd);

  return {
    rpIdHash,
    flags,
    signCount,
    credentialId,
    credentialPublicKey,
  };
}

function decodeCbor(data: Buffer, offset = 0): { value: unknown; bytesRead: number } {
  const initialByte = data[offset];

  if (initialByte === undefined) {
    throw new WebAuthnVerificationError("Unexpected end of CBOR data.");
  }

  const majorType = initialByte >> 5;
  const additionalInfo = initialByte & 0x1f;
  const { value: lengthOrValue, nextOffset } = readCborLength(data, offset + 1, additionalInfo);

  switch (majorType) {
    case 0:
      return { value: lengthOrValue, bytesRead: nextOffset - offset };
    case 1:
      return { value: -1 - lengthOrValue, bytesRead: nextOffset - offset };
    case 2: {
      const endOffset = nextOffset + lengthOrValue;
      return {
        value: data.subarray(nextOffset, endOffset),
        bytesRead: endOffset - offset,
      };
    }
    case 3: {
      const endOffset = nextOffset + lengthOrValue;
      return {
        value: data.subarray(nextOffset, endOffset).toString("utf8"),
        bytesRead: endOffset - offset,
      };
    }
    case 4: {
      const items: unknown[] = [];
      let cursor = nextOffset;

      for (let index = 0; index < lengthOrValue; index += 1) {
        const item = decodeCbor(data, cursor);
        items.push(item.value);
        cursor += item.bytesRead;
      }

      return { value: items, bytesRead: cursor - offset };
    }
    case 5: {
      const entries: Record<string, unknown> = {};
      let cursor = nextOffset;

      for (let index = 0; index < lengthOrValue; index += 1) {
        const key = decodeCbor(data, cursor);
        cursor += key.bytesRead;
        const entryValue = decodeCbor(data, cursor);
        cursor += entryValue.bytesRead;
        entries[String(key.value)] = entryValue.value;
      }

      return { value: entries, bytesRead: cursor - offset };
    }
    case 6: {
      const taggedValue = decodeCbor(data, nextOffset);
      return { value: taggedValue.value, bytesRead: nextOffset - offset + taggedValue.bytesRead };
    }
    case 7:
      return decodeSimpleCborValue(additionalInfo, offset, nextOffset, data);
    default:
      throw new WebAuthnVerificationError("Unsupported CBOR major type.");
  }
}

function decodeSimpleCborValue(
  additionalInfo: number,
  offset: number,
  nextOffset: number,
  data: Buffer,
): { value: unknown; bytesRead: number } {
  if (additionalInfo === 20) {
    return { value: false, bytesRead: nextOffset - offset };
  }

  if (additionalInfo === 21) {
    return { value: true, bytesRead: nextOffset - offset };
  }

  if (additionalInfo === 22) {
    return { value: null, bytesRead: nextOffset - offset };
  }

  if (additionalInfo === 23) {
    return { value: undefined, bytesRead: nextOffset - offset };
  }

  if (additionalInfo === 24) {
    return { value: data[nextOffset], bytesRead: nextOffset - offset + 1 };
  }

  throw new WebAuthnVerificationError("Unsupported CBOR simple value.");
}

function readCborLength(
  data: Buffer,
  offset: number,
  additionalInfo: number,
): { value: number; nextOffset: number } {
  if (additionalInfo < 24) {
    return { value: additionalInfo, nextOffset: offset };
  }

  if (additionalInfo === 24) {
    const value = data[offset];
    if (value === undefined) {
      throw new WebAuthnVerificationError("Unexpected end of CBOR data.");
    }
    return { value, nextOffset: offset + 1 };
  }

  if (additionalInfo === 25) {
    if (offset + 2 > data.length) {
      throw new WebAuthnVerificationError("Unexpected end of CBOR data.");
    }
    return { value: data.readUInt16BE(offset), nextOffset: offset + 2 };
  }

  if (additionalInfo === 26) {
    if (offset + 4 > data.length) {
      throw new WebAuthnVerificationError("Unexpected end of CBOR data.");
    }
    return { value: data.readUInt32BE(offset), nextOffset: offset + 4 };
  }

  throw new WebAuthnVerificationError("Unsupported CBOR length encoding.");
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new WebAuthnVerificationError(`${fieldName} must be a non-empty string.`);
  }

  return value;
}

function encodeDecodedBase64Url(value: string, fieldName: string): string {
  return toBase64Url(decodeBase64Url(value, fieldName));
}

function decodeBase64Url(value: string, fieldName: string): Buffer {
  if (typeof value !== "string" || value.trim() === "") {
    throw new WebAuthnVerificationError(`${fieldName} must be a non-empty base64url string.`);
  }

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(paddingLength);

  try {
    return Buffer.from(padded, "base64");
  } catch {
    throw new WebAuthnVerificationError(`${fieldName} must be a valid base64url string.`);
  }
}

function normalizeOrigin(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    throw new WebAuthnVerificationError("clientDataJSON.origin must be a valid origin URL.");
  }
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function assertBuffersEqual(expected: Buffer, actual: Buffer, message: string): void {
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new WebAuthnVerificationError(message);
  }
}

function toBase64Url(value: Uint8Array): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

interface RequestOriginFallbackHeaders {
  forwardedHost?: string | string[];
  forwardedProto?: string | string[];
  referer?: string | string[];
}

export function deriveRequestOrigin(
  originHeader: string | string[] | undefined,
  fallbackUrl: URL,
  headers: RequestOriginFallbackHeaders = {},
): string {
  const explicitOrigin = readFirstHeaderValue(originHeader);
  if (explicitOrigin) {
    return explicitOrigin;
  }

  const forwardedHost = readFirstHeaderValue(headers.forwardedHost);
  if (forwardedHost) {
    const forwardedProto = readFirstHeaderValue(headers.forwardedProto)
      ?? fallbackUrl.protocol.replace(/:$/, "")
      ?? "http";
    return `${forwardedProto}://${forwardedHost}`;
  }

  const referer = readFirstHeaderValue(headers.referer);
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // Fall back to the request URL origin when referer is malformed.
    }
  }

  return fallbackUrl.origin;
}

function readFirstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = readFirstHeaderValue(item);
      if (normalized) {
        return normalized;
      }
    }
    return undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const [first] = value.split(",", 1);
  const normalized = first?.trim();
  return normalized ? normalized : undefined;
}

export function deriveRpId(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    throw new WebAuthnVerificationError("Could not derive the RP ID for this registration request.");
  }
}
