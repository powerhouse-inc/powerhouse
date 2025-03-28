export const DEFAULT_RENOWN_URL = "https://auth.renown.id";
export const DEFAULT_RENOWN_NETWORK_ID = "eip155";
export const DEFAULT_RENOWN_CHAIN_ID = "1";

export const DOMAIN_TYPE = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
] as const;

export const VERIFIABLE_CREDENTIAL_EIP712_TYPE = [
  { name: "@context", type: "string[]" },
  { name: "type", type: "string[]" },
  { name: "id", type: "string" },
  { name: "issuer", type: "Issuer" },
  { name: "credentialSubject", type: "CredentialSubject" },
  { name: "credentialSchema", type: "CredentialSchema" },
  { name: "issuanceDate", type: "string" },
  { name: "expirationDate", type: "string" },
] as const;

export const CREDENTIAL_SCHEMA_EIP712_TYPE = [
  { name: "id", type: "string" },
  { name: "type", type: "string" },
] as const;

export const CREDENTIAL_SUBJECT_TYPE = [
  { name: "app", type: "string" },
  { name: "id", type: "string" },
  { name: "name", type: "string" },
] as const;

export const ISSUER_TYPE = [
  { name: "id", type: "string" },
  { name: "ethereumAddress", type: "string" },
] as const;

export const CREDENTIAL_TYPES = {
  EIP712Domain: DOMAIN_TYPE,
  VerifiableCredential: VERIFIABLE_CREDENTIAL_EIP712_TYPE,
  CredentialSchema: CREDENTIAL_SCHEMA_EIP712_TYPE,
  CredentialSubject: CREDENTIAL_SUBJECT_TYPE,
  Issuer: ISSUER_TYPE,
} as const;
