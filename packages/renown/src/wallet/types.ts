import type { ComponentType, ReactNode } from "react";
import type { SignCredentialTypedData } from "../credential.js";

// Const object rather than an enum so config can be authored with plain string
// literals (`methods: ["google"]`) while `LoginMethod.GOOGLE` still works.
export const LoginMethod = {
  WALLET: "wallet",
  GOOGLE: "google",
  EMAIL: "email",
  APPLE: "apple",
} as const;

export type LoginMethod = (typeof LoginMethod)[keyof typeof LoginMethod];

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
  // Capability, not policy: the session can sign without a user prompt (e.g. a
  // Privy embedded wallet). Whether/when to sign silently is the host's call.
  canSignSilently?: boolean;
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
}

// Identity + capabilities, declared once per adapter in a dependency-free module
// so a host can list methods and detect a redirect return with no wallet library.
export interface WalletAdapterMeta {
  id: string;
  // URL params the adapter leaves when a full-page OAuth login returns; empty for
  // adapters with no redirect flow.
  redirectReturnParams: string[];
  // Must be known before load(): the login UI renders buttons before any wallet
  // library is fetched.
  supportedMethods: LoginMethod[];
}

// Behaviour only — what an adapter factory returns. Identity lives in the meta.
export interface WalletAdapterImpl {
  // React provider that must wrap the app subtree for this adapter to work; the
  // host passes its current theme so the adapter's UI can match.
  Provider: ComponentType<{ children: ReactNode; theme?: WalletTheme }>;
  // Hook returning imperative controls; MUST be called inside <Provider>.
  useController: () => WalletController;
}

// What the host consumes: resolveAdapters pairs an impl with its meta.
export interface WalletAdapter extends WalletAdapterImpl {
  meta: WalletAdapterMeta;
}

// An adapter's light entry: eager meta plus a lazy loader that pulls the factory
// and its wallet library only once login is activated.
export interface WalletAdapterDescriptor {
  meta: WalletAdapterMeta;
  load: () => Promise<WalletAdapterImpl>;
}

export type WalletAdapterFactory<Config = unknown> = (
  config: Config,
) => WalletAdapterImpl;

export type WalletAdapterProvider<Config = unknown> = (
  config: Config,
) => WalletAdapterDescriptor;
