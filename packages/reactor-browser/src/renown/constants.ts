export const RENOWN_URL = "https://www.renown.id";
export const RENOWN_NETWORK_ID = "eip155";
export const RENOWN_CHAIN_ID = "1";

// EIP-712 credential types are canonical in @renown/sdk; re-export to avoid drift.
export {
  CREDENTIAL_TYPES,
  DOMAIN_TYPE,
  VERIFIABLE_CREDENTIAL_EIP712_TYPE,
  CREDENTIAL_SCHEMA_EIP712_TYPE,
  CREDENTIAL_SUBJECT_TYPE,
  ISSUER_TYPE,
} from "@renown/sdk";
