export const RENOWN_URL = "https://www.renown.id";
export const RENOWN_NETWORK_ID = "eip155";
export const RENOWN_CHAIN_ID = "1";

// Params deleted from the `returnUrl` handed to renown.id. Everything else in
// the current URL rides along, so an in-app link survives the round trip.
// - `user`: Renown's own return param. Connect reads it without consuming it,
//   so it lingers in the URL; sending it back would hand Renown a stale DID.
// - `privy_oauth_*`: the `redirectReturnParams` of the Privy wallet adapter
//   (packages/renown/src/wallet/privy/meta.ts). Returning them makes
//   `isWalletRedirectReturn` fire on an ordinary Renown return. Keep this list
//   in sync with every adapter's `redirectReturnParams`.
export const RENOWN_RETURN_URL_STRIPPED_PARAMS: readonly string[] = [
  "user",
  "privy_oauth_code",
  "privy_oauth_state",
];

// EIP-712 credential types are canonical in @renown/sdk; re-export to avoid drift.
export {
  CREDENTIAL_TYPES,
  DOMAIN_TYPE,
  VERIFIABLE_CREDENTIAL_EIP712_TYPE,
  CREDENTIAL_SCHEMA_EIP712_TYPE,
  CREDENTIAL_SUBJECT_TYPE,
  ISSUER_TYPE,
} from "@renown/sdk";
