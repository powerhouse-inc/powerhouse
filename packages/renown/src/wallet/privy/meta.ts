import type { Chain } from "viem";
import { LoginMethod, type WalletAdapterMeta } from "../types.js";

// Login methods the Privy adapter can drive. adapter.ts maps each to a Privy
// login-method id, so adding one here without mapping it fails to compile.
export type PrivyLoginMethod = "wallet" | "google" | "apple" | "email";

export const PRIVY_SUPPORTED_METHODS: PrivyLoginMethod[] = [
  LoginMethod.WALLET,
  LoginMethod.GOOGLE,
  LoginMethod.APPLE,
  LoginMethod.EMAIL,
];

// Methods offered when config omits `methods`.
export const DEFAULT_PRIVY_METHODS: LoginMethod[] = [
  LoginMethod.GOOGLE,
  LoginMethod.EMAIL,
];

// Config slice for the Privy adapter (mirrors connect.renown.adapters.privy).
export interface PHRenownPrivyAdapterConfig {
  appId: string;
  clientId?: string;
  /** Login methods to offer; defaults to [google, email]. */
  methods?: PrivyLoginMethod[];
  /** Chain Renown issues credentials on (e.g. `mainnet` from `viem/chains`). Pins the embedded wallet to it: a wallet on another chain is a different DID and is rejected. */
  chain?: Chain;
}

// Resolve config `methods` to the supported set, falling back to the default.
// Takes string[] because Connect's config arrives from JSON, unvalidated.
export function resolvePrivyMethods(methods?: string[]): LoginMethod[] {
  if (!methods || methods.length === 0) return [...DEFAULT_PRIVY_METHODS];
  const resolved: LoginMethod[] = [];
  for (const method of methods) {
    const value = method as PrivyLoginMethod;
    if (!PRIVY_SUPPORTED_METHODS.includes(value)) {
      throw new Error(`PrivyAdapter cannot support login method "${method}"`);
    }
    resolved.push(value);
  }
  return resolved;
}

// Dependency-free identity, safe to import eagerly (pulls no wallet library);
// the heavy factory stays behind the dynamic import in ./index.ts.
export const privyAdapterMeta: Omit<WalletAdapterMeta, "supportedMethods"> = {
  id: "privy",
  redirectReturnParams: ["privy_oauth_code", "privy_oauth_state"],
};
