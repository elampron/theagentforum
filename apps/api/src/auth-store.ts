import type {
  Actor,
  AuthenticationSession,
  CompleteRegistrationVerificationInput,
  PasskeyAuthenticationOptions,
  PasskeyRegistrationOptions,
  RedeemPairingInput,
  RegistrationSession,
  StartAuthenticationInput,
  StartRegistrationInput,
  WebSession,
} from "@theagentforum/core";

export interface StoredPasskeyCredential {
  handle: string;
  credentialId: string;
  publicKey: string;
  signCount: number;
  label?: string;
  transports?: string[];
}

export interface VerifiedPasskeyRegistration {
  registrationSessionId: string;
  credentialId: string;
  publicKey: string;
  verificationMethod: string;
  passkeyLabel?: string;
  transports?: string[];
}

export interface VerifiedPasskeyAuthentication {
  authenticationSessionId: string;
  credentialId: string;
  verificationMethod: string;
  signCount: number;
  passkeyLabel?: string;
}

export interface IssuedWebSession extends WebSession {
  token: string;
}

export interface ApiTokenSession {
  actor: Actor;
  createdAt: string;
  expiresAt: string;
  deviceLabel?: string;
}

export interface AuthStore {
  startRegistration(input: StartRegistrationInput): Promise<RegistrationSession>;
  getRegistrationSession(registrationSessionId: string): Promise<RegistrationSession | null>;
  getRegistrationSessionByVerificationToken(
    verificationToken: string,
  ): Promise<RegistrationSession | null>;
  getPasskeyRegistrationOptions(
    registrationSessionId: string,
  ): Promise<PasskeyRegistrationOptions | null>;
  finishPasskeyRegistration(input: VerifiedPasskeyRegistration): Promise<RegistrationSession | null>;
  completeRegistrationVerification(
    registrationSessionId: string,
    input: CompleteRegistrationVerificationInput,
  ): Promise<RegistrationSession | null>;
  redeemPairing(input: RedeemPairingInput): Promise<RegistrationSession | null>;
  startAuthentication(input: StartAuthenticationInput): Promise<AuthenticationSession | null>;
  getAuthenticationSession(authenticationSessionId: string): Promise<AuthenticationSession | null>;
  getPasskeyAuthenticationOptions(
    authenticationSessionId: string,
  ): Promise<PasskeyAuthenticationOptions | null>;
  getPasskeyCredential(credentialId: string): Promise<StoredPasskeyCredential | null>;
  finishPasskeyAuthentication(
    input: VerifiedPasskeyAuthentication,
  ): Promise<AuthenticationSession | null>;
  createWebSession(authenticationSessionId: string): Promise<IssuedWebSession | null>;
  getWebSession(token: string): Promise<WebSession | null>;
  revokeWebSession(token: string): Promise<void>;
  getApiTokenSession(token: string): Promise<ApiTokenSession | null>;
  revokeApiToken(token: string): Promise<void>;
}
