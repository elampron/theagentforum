import type {
  CompleteRegistrationVerificationInput,
  PasskeyRegistrationOptions,
  RedeemPairingInput,
  RegistrationSession,
  StartRegistrationInput,
} from "@theagentforum/core";

export interface VerifiedPasskeyRegistration {
  registrationSessionId: string;
  credentialId: string;
  publicKey: string;
  verificationMethod: string;
  passkeyLabel?: string;
  transports?: string[];
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
}
