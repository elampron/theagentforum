import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../lib/api";
import { AuthPage } from "./AuthPage";

describe("AuthPage", () => {
  const originalCredentials = navigator.credentials;
  const originalPublicKeyCredential = (window as typeof window & {
    PublicKeyCredential?: typeof PublicKeyCredential;
  }).PublicKeyCredential;

  beforeEach(() => {
    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: class PublicKeyCredentialMock {},
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: originalCredentials,
    });

    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: originalPublicKeyCredential,
    });
  });

  it("shows only the selected auth path on a fresh visit", async () => {
    const user = userEvent.setup();
    const api = {
      listQuestions: vi.fn(),
      searchThreads: vi.fn(),
      createQuestion: vi.fn(),
      getQuestionThread: vi.fn(),
      createAnswer: vi.fn(),
      acceptAnswer: vi.fn(),
      listAnswerSkills: vi.fn(),
      startRegistration: vi.fn(),
      getRegistrationSession: vi.fn(),
      resolveRegistrationSession: vi.fn(),
      getPasskeyRegistrationOptions: vi.fn(),
      registerPasskey: vi.fn(),
      completeRegistrationVerification: vi.fn(),
      redeemPairing: vi.fn(),
    } as unknown as ApiClient;

    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <AuthPage api={api} />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole("heading", { name: /sign in with a passkey/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /start a handoff/i }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /use existing passkey/i }),
    );

    expect(
      screen.getByRole("heading", { name: /sign in with a passkey/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Handle")).toBeInTheDocument();
    expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /start handoff/i }),
    ).not.toBeInTheDocument();
  });

  it("moves from the passkey step to the pairing step without showing both at once", async () => {
    const user = userEvent.setup();
    const createCredential = vi.fn().mockResolvedValue(
      buildCredential({
        credentialId: Uint8Array.from([1, 2, 3, 4]),
        clientDataJson: new TextEncoder().encode(
          JSON.stringify({
            type: "webauthn.create",
            challenge: "AQIDBA",
            origin: window.location.origin,
          }),
        ),
        attestationObject: Uint8Array.from([9, 8, 7, 6]),
        publicKey: Uint8Array.from([4, 3, 2, 1]),
        publicKeyAlgorithm: -7,
        transports: ["internal"],
      }),
    );

    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: {
        create: createCredential,
      },
    });

    const registerPasskey = vi.fn().mockResolvedValue({
      ...buildRegistrationSession(),
      status: "verified",
      verificationMethod: "webauthn",
      passkeyLabel: "Felix MacBook Passkey",
      verifiedAt: "2026-03-26T00:01:00.000Z",
      pairing: {
        ...buildRegistrationSession().pairing,
        status: "ready_to_pair",
      },
    });

    const api = {
      listQuestions: vi.fn(),
      searchThreads: vi.fn(),
      createQuestion: vi.fn(),
      getQuestionThread: vi.fn(),
      createAnswer: vi.fn(),
      acceptAnswer: vi.fn(),
      listAnswerSkills: vi.fn(),
      startRegistration: vi.fn(),
      getRegistrationSession: vi.fn().mockResolvedValue(buildRegistrationSession()),
      resolveRegistrationSession: vi.fn(),
      getPasskeyRegistrationOptions: vi.fn().mockResolvedValue({
        registrationSessionId: "ars-1",
        rp: { id: "localhost", name: "TheAgentForum" },
        user: {
          id: "BQYHCA",
          name: "felix796",
          displayName: "Felix",
        },
        challenge: "AQIDBA",
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        timeout: 60000,
        attestation: "none",
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
      }),
      registerPasskey,
      completeRegistrationVerification: vi.fn(),
      redeemPairing: vi.fn(),
    } as unknown as ApiClient;

    render(
      <MemoryRouter initialEntries={["/auth?registration=ars-1"]}>
        <AuthPage api={api} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "save passkey" }),
      ).toBeEnabled();
    });

    expect(
      screen.getByRole("heading", { name: /save a passkey/i }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Pairing code")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Passkey label"));
    await user.type(screen.getByLabelText("Passkey label"), "Felix MacBook Passkey");
    await user.click(screen.getByRole("button", { name: "save passkey" }));

    await waitFor(() => {
      expect(createCredential).toHaveBeenCalledTimes(1);
      expect(registerPasskey).toHaveBeenCalledTimes(1);
    });

    expect(
      screen.getByRole("heading", { name: /pair this agent/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Pairing code")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "save passkey" }),
    ).not.toBeInTheDocument();

    const creationCall = createCredential.mock.calls[0]?.[0] as { publicKey?: PublicKeyCredentialCreationOptions };
    expect(creationCall.publicKey).toBeDefined();
    expect(Array.from(new Uint8Array(creationCall.publicKey?.challenge as ArrayBuffer))).toEqual([
      1, 2, 3, 4,
    ]);
    expect(Array.from(new Uint8Array(creationCall.publicKey?.user.id as ArrayBuffer))).toEqual([
      5, 6, 7, 8,
    ]);

    expect(registerPasskey).toHaveBeenCalledWith({
      registrationSessionId: "ars-1",
      credential: {
        id: "AQIDBA",
        rawId: "AQIDBA",
        type: "public-key",
        response: {
          attestationObject: "CQgHBg",
          clientDataJSON: toBase64Url(
            new TextEncoder().encode(
              JSON.stringify({
                type: "webauthn.create",
                challenge: "AQIDBA",
                origin: window.location.origin,
              }),
            ),
          ),
          publicKey: "BAMCAQ",
          publicKeyAlgorithm: -7,
          transports: ["internal"],
        },
        authenticatorAttachment: "platform",
        clientExtensionResults: { credProps: { rk: true } },
      },
      passkeyLabel: "Felix MacBook Passkey",
    });
  });

  it("starts passkey sign-in and refreshes auth state after authentication succeeds", async () => {
    const user = userEvent.setup();
    const getCredential = vi.fn().mockResolvedValue(
      buildAuthenticationCredential({
        credentialId: Uint8Array.from([1, 2, 3, 4]),
        clientDataJson: new TextEncoder().encode(
          JSON.stringify({
            type: "webauthn.get",
            challenge: "AQIDBA",
            origin: window.location.origin,
          }),
        ),
        authenticatorData: Uint8Array.from([9, 8, 7, 6]),
        signature: Uint8Array.from([4, 3, 2, 1]),
      }),
    );

    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: {
        get: getCredential,
      },
    });

    const onAuthStateChange = vi.fn().mockResolvedValue(undefined);
    const api = {
      listQuestions: vi.fn(),
      searchThreads: vi.fn(),
      createQuestion: vi.fn(),
      getQuestionThread: vi.fn(),
      createAnswer: vi.fn(),
      acceptAnswer: vi.fn(),
      listAnswerSkills: vi.fn(),
      startRegistration: vi.fn(),
      getRegistrationSession: vi.fn(),
      resolveRegistrationSession: vi.fn(),
      getPasskeyRegistrationOptions: vi.fn(),
      registerPasskey: vi.fn(),
      completeRegistrationVerification: vi.fn(),
      redeemPairing: vi.fn(),
      startAuthentication: vi.fn().mockResolvedValue({
        id: "aas-1",
        handle: "felix796",
        displayName: "Felix",
        status: "awaiting_authentication",
        challenge: "AQIDBA",
        createdAt: "2026-03-26T00:00:00.000Z",
        expiresAt: "2026-03-26T00:15:00.000Z",
      }),
      getPasskeyAuthenticationOptions: vi.fn().mockResolvedValue({
        authenticationSessionId: "aas-1",
        challenge: "AQIDBA",
        rpId: "localhost",
        allowCredentials: [{ id: "AQIDBA", type: "public-key", transports: ["internal"] }],
        timeout: 60000,
        userVerification: "required",
      }),
      authenticatePasskey: vi.fn().mockResolvedValue({
        id: "aas-1",
        handle: "felix796",
        displayName: "Felix",
        status: "verified",
        challenge: "AQIDBA",
        verificationMethod: "webauthn",
        passkeyLabel: "Felix MacBook Passkey",
        createdAt: "2026-03-26T00:00:00.000Z",
        expiresAt: "2026-03-26T00:15:00.000Z",
        verifiedAt: "2026-03-26T00:01:00.000Z",
      }),
    } as unknown as ApiClient;

    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <AuthPage api={api} onAuthStateChange={onAuthStateChange} />
      </MemoryRouter>,
    );

    await user.click(
      screen.getByRole("button", { name: /use existing passkey/i }),
    );
    await user.type(screen.getByLabelText("Handle"), "felix796");
    await user.click(screen.getByRole("button", { name: "sign in" }));

    await waitFor(() => {
      expect(getCredential).toHaveBeenCalledTimes(1);
      expect(onAuthStateChange).toHaveBeenCalledTimes(1);
    });

    expect(api.startAuthentication).toHaveBeenCalledWith({ handle: "felix796" });
    expect(api.authenticatePasskey).toHaveBeenCalledWith({
      authenticationSessionId: "aas-1",
      credential: {
        id: "AQIDBA",
        rawId: "AQIDBA",
        type: "public-key",
        response: {
          authenticatorData: "CQgHBg",
          clientDataJSON: toBase64Url(
            new TextEncoder().encode(
              JSON.stringify({
                type: "webauthn.get",
                challenge: "AQIDBA",
                origin: window.location.origin,
              }),
            ),
          ),
          signature: "BAMCAQ",
        },
        authenticatorAttachment: "platform",
        clientExtensionResults: { credProps: { rk: true } },
      },
    });
  });
});

function buildRegistrationSession() {
  return {
    id: "ars-1",
    handle: "felix796",
    displayName: "Felix",
    status: "pending_webauthn_registration" as const,
    challenge: "AQIDBA",
    verificationUrl: "/auth?registration=verify-token-1",
    verificationToken: "verify-token-1",
    createdAt: "2026-03-26T00:00:00.000Z",
    expiresAt: "2026-03-26T00:15:00.000Z",
    pairing: {
      id: "aps-1",
      code: "PAIR1234",
      status: "waiting_for_verification" as const,
      createdAt: "2026-03-26T00:00:00.000Z",
      expiresAt: "2026-03-26T00:30:00.000Z",
    },
  };
}

function buildCredential(input: {
  credentialId: Uint8Array;
  clientDataJson: Uint8Array;
  attestationObject: Uint8Array;
  publicKey: Uint8Array;
  publicKeyAlgorithm: number;
  transports: string[];
}) {
  const response = {
    clientDataJSON: input.clientDataJson.buffer.slice(0),
    attestationObject: input.attestationObject.buffer.slice(0),
    getPublicKey: () => input.publicKey.buffer.slice(0),
    getPublicKeyAlgorithm: () => input.publicKeyAlgorithm,
    getTransports: () => input.transports,
  };

  return {
    id: toBase64Url(input.credentialId),
    rawId: input.credentialId.buffer.slice(0),
    type: "public-key",
    response,
    authenticatorAttachment: "platform",
    getClientExtensionResults: () => ({ credProps: { rk: true } }),
  } as unknown as PublicKeyCredential;
}

function buildAuthenticationCredential(input: {
  credentialId: Uint8Array;
  clientDataJson: Uint8Array;
  authenticatorData: Uint8Array;
  signature: Uint8Array;
}) {
  const response = {
    clientDataJSON: input.clientDataJson.buffer.slice(0),
    authenticatorData: input.authenticatorData.buffer.slice(0),
    signature: input.signature.buffer.slice(0),
  };

  return {
    id: toBase64Url(input.credentialId),
    rawId: input.credentialId.buffer.slice(0),
    type: "public-key",
    response,
    authenticatorAttachment: "platform",
    getClientExtensionResults: () => ({ credProps: { rk: true } }),
  } as unknown as PublicKeyCredential;
}

function toBase64Url(value: Uint8Array): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
