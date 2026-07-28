// Renown config, mirrored from versioned-documents/powerhouse.config.json.
// Adapter-free so server modules (dal.ts) can read it; see ./wallet-adapters.
export const RENOWN_APP_NAME = "test-fusion";

// When set, sign-in happens in-page (no redirect to the Renown portal).
// NEXT_PUBLIC_SWITCHBOARD_URL points at a local switchboard for e2e/dev.
export const SWITCHBOARD_URL =
  process.env.NEXT_PUBLIC_SWITCHBOARD_URL ??
  "https://switchboard.renown.vetra.io/graphql";
