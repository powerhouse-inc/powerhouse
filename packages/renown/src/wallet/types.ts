import type { ComponentType, ReactNode } from "react";
import type { SignCredentialTypedData } from "../credential.js";

export enum LoginMethod {
  WALLET = "wallet",
  GOOGLE = "google",
  EMAIL = "email",
  APPLE = "apple",
}

// Default login methods per adapter when config omits `methods`; single source
// of truth shared by the adapters and useRenownLoginMethods so they can't drift.
export const DEFAULT_PRIVY_METHODS: LoginMethod[] = [
  LoginMethod.GOOGLE,
  LoginMethod.EMAIL,
];
export const DEFAULT_MOCK_METHODS: LoginMethod[] = [
  LoginMethod.WALLET,
  LoginMethod.GOOGLE,
  LoginMethod.EMAIL,
];

// Colors the host passes into an adapter Provider so its wallet UI matches.
// The adapter stays agnostic to how the host derives them (CSS tokens, etc.).
export interface WalletThemeColors {
  accentColor?: string;
  accentColorForeground?: string;
}

// The theme the host passes at runtime: a bare mode, or a mode plus colors.
export type WalletTheme =
  | "light"
  | "dark"
  | ({ mode: "light" | "dark" } & WalletThemeColors);

// Normalize a WalletTheme (or undefined) to a mode + colors the adapters use.
export function normalizeWalletTheme(theme: WalletTheme | undefined): {
  mode: "light" | "dark";
  accentColor?: string;
  accentColorForeground?: string;
} {
  if (theme === undefined) return { mode: "light" };
  if (typeof theme === "string") return { mode: theme };
  return {
    mode: theme.mode,
    accentColor: theme.accentColor,
    accentColorForeground: theme.accentColorForeground,
  };
}

// The signer surface signIn needs, produced by an adapter after the user connects.
export interface WalletSession {
  address: `0x${string}`;
  chainId: number;
  signTypedData: SignCredentialTypedData;
  // Set when the session can sign without a user prompt (e.g. a Privy embedded
  // wallet), so a host may complete sign-in with it silently on an OAuth return.
  autoSignIn?: boolean;
}

// Imperative controls returned by an adapter's React hook (used inside its Provider).
export interface WalletController {
  connect(method?: LoginMethod): Promise<WalletSession>;
  disconnect(): Promise<void>;
  getSession(): WalletSession | undefined;
  // Optional push stream of session changes (fires immediately with the current
  // one), so a host can complete sign-in on an OAuth return with no live connect().
  subscribe?(
    listener: (session: WalletSession | undefined) => void,
  ): () => void;
  supportedMethods: LoginMethod[];
}

// What each adapter subexport default-exports (a factory over its own config slice).
export interface WalletAdapter {
  id: "rainbow" | "privy" | "mock";
  supportedMethods: LoginMethod[];
  // React provider that must wrap the app subtree for this adapter to work.
  // The host passes its current theme so the adapter's UI can match.
  Provider: ComponentType<{ children: ReactNode; theme?: WalletTheme }>;
  // Hook returning imperative controls; MUST be called inside <Provider>.
  useController: () => WalletController;
}

export type WalletAdapterFactory<Config = unknown> = (
  config: Config,
) => WalletAdapter;

// Minimal descriptor an adapter exposes for eager import (no wallet library), so
// a host can detect a redirect return without loading the adapter's heavy factory.
export interface WalletAdapterMeta {
  id: WalletAdapter["id"];
  // URL params the adapter leaves when a full-page OAuth login returns; empty for
  // adapters with no redirect flow.
  redirectReturnParams: string[];
}
