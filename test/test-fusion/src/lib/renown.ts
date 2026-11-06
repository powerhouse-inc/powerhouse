// Renown + switchboard config, mirrored from versioned-documents/powerhouse.config.json.
// Adapter-free so server modules (dal.ts) can read it; see ./wallet-adapters.
export const RENOWN_APP_NAME = "test-fusion";

export type RenownLoginMode = "embedded" | "redirect";

// "embedded" signs in in-page with the wallet adapters (./wallet-adapters);
// "redirect" sends the user to the Renown portal and back. Inlined at build
// time: next.config.ts aliases the adapters module away in redirect mode, so a
// redirect build carries no wallet library.
export const RENOWN_LOGIN_MODE: RenownLoginMode =
  process.env.NEXT_PUBLIC_RENOWN_LOGIN_MODE === "redirect"
    ? "redirect"
    : "embedded";

// The Renown portal a redirect sign-in goes to (and comes back from).
export const RENOWN_URL =
  process.env.NEXT_PUBLIC_RENOWN_URL ?? "https://www.renown.id";

// Renown's own switchboard: issues credentials on in-page sign-in, serves them
// for a redirect sign-in, and verifies them server-side (dal.ts). Not the data
// switchboard below.
export const RENOWN_SWITCHBOARD_URL =
  process.env.NEXT_PUBLIC_RENOWN_SWITCHBOARD_URL ??
  "https://switchboard.renown.vetra.io/graphql";

// The switchboard the app's documents live on (GraphQLReactorProvider).
export const SWITCHBOARD_URL =
  process.env.NEXT_PUBLIC_SWITCHBOARD_URL ?? "http://localhost:4001/graphql";
