import { LoginMethod, type WalletAdapterMeta } from "../types.js";

export type MockLoginMethod = "wallet" | "google" | "apple" | "email";

const MOCK_SUPPORTED_METHODS: MockLoginMethod[] = [
  LoginMethod.WALLET,
  LoginMethod.GOOGLE,
  LoginMethod.APPLE,
  LoginMethod.EMAIL,
];

// Methods offered when config omits `methods`.
export const DEFAULT_MOCK_METHODS: LoginMethod[] = [
  LoginMethod.WALLET,
  LoginMethod.GOOGLE,
  LoginMethod.EMAIL,
];

/** Config for the mock wallet adapter. TEST/DEV ONLY — signs with a local key; never enable in production. */
export interface PHRenownMockAdapterConfig {
  /** Signing key; defaults to the well-known Anvil test account #0. */
  privateKey?: `0x${string}`;
  /** Chain id reported in the session (default 1). */
  chainId?: number;
  /** Methods this adapter answers for; defaults to wallet + google + email. */
  methods?: MockLoginMethod[];
}

// Resolve config `methods` to the supported set, falling back to the default.
// Takes string[] because Connect's config arrives from JSON, unvalidated.
export function resolveMockMethods(methods?: string[]): LoginMethod[] {
  if (!methods || methods.length === 0) return [...DEFAULT_MOCK_METHODS];
  const resolved: LoginMethod[] = [];
  for (const method of methods) {
    const value = method as MockLoginMethod;
    if (!MOCK_SUPPORTED_METHODS.includes(value)) {
      throw new Error(`MockAdapter cannot support login method "${method}"`);
    }
    resolved.push(value);
  }
  return resolved;
}

// Dependency-free identity (see privy/meta.ts). The mock signer has no
// full-page OAuth redirect.
export const mockAdapterMeta: Omit<WalletAdapterMeta, "supportedMethods"> = {
  id: "mock",
  redirectReturnParams: [],
};
