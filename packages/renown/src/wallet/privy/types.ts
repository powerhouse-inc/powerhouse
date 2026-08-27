import type { WalletController, WalletSession } from "../types.js";

// Host-facing types for the Privy controller. Free of @privy-io imports (type
// ones included) so index.ts can re-export them without dragging the peer in.

/** Privy's email OTP flow status, as reported by its `useLoginWithEmail`. */
export type PrivyEmailStatus =
  | "initial"
  | "sending-code"
  | "awaiting-code-input"
  | "submitting-code"
  | "done"
  | "error";

/** Privy auth state the bridge mirrors into the core, for hosts drawing their own sign-in screens. */
export interface PrivyAuthState {
  /** Privy has finished restoring any existing session. */
  ready: boolean;
  /** Privy holds a session (before Renown has issued a credential). */
  authenticated: boolean;
  /** The signed-in user's verified email, when logged in by email. */
  email?: string;
  emailStatus: PrivyEmailStatus;
  emailError?: Error;
}

export interface SendCodeOptions {
  /** Reject addresses with no Privy account instead of creating one. */
  disableSignup?: boolean;
}

/** The Privy adapter's controller: `WalletController` plus the headless email OTP surface, so a host can draw its own sign-in screens without importing `@privy-io/react-auth`. */
export interface PrivyWalletController extends WalletController {
  /** Send a one-time code to `email`. */
  sendCode(email: string, options?: SendCodeOptions): Promise<void>;
  /** Verify the code; resolves with the embedded-wallet session, ready for `login(session)`. */
  loginWithCode(code: string): Promise<WalletSession>;
  getState(): PrivyAuthState;
  subscribeState(listener: (state: PrivyAuthState) => void): () => void;
}
