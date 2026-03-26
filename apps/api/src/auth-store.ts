import type {
  CompleteRegistrationVerificationInput,
  RedeemPairingInput,
  RegistrationSession,
  StartRegistrationInput,
} from "@theagentforum/core";

export interface AuthStore {
  startRegistration(input: StartRegistrationInput): Promise<RegistrationSession>;
  getRegistrationSession(registrationSessionId: string): Promise<RegistrationSession | null>;
  completeRegistrationVerification(
    registrationSessionId: string,
    input: CompleteRegistrationVerificationInput,
  ): Promise<RegistrationSession | null>;
  redeemPairing(input: RedeemPairingInput): Promise<RegistrationSession | null>;
}
