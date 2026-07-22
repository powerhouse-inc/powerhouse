import type {
  User as EditorUser,
  ISigner,
} from "@powerhousedao/shared/document-model";
import type { CREDENTIAL_TYPES } from "./constants.js";
import type { SignCredentialTypedData } from "./credential.js";
import type { IRenownCrypto } from "./crypto/types.js";
import type { IEventEmitter } from "./event/types.js";
import type { IStorage } from "./storage/common.js";

export type { ISigner };

// Local mirrors of the did-jwt-vc / did-jwt / did-resolver shapes that would
// otherwise leak across renown's public .d.ts surface. Re-declaring them keeps
// consumers from having to resolve did-jwt-vc / did-jwt / multibase types
// transitively. Each shape below matches its upstream definition exactly so
// the public API is unchanged — including unions like
// `"known-literal" | string` that are wider than `string` but document the
// recognised values.
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */

// --- did-jwt shapes -------------------------------------------------------

export interface EcdsaSignature {
  r: string;
  s: string;
  recoveryParam?: number;
}

export type Signer = (
  data: string | Uint8Array,
) => Promise<EcdsaSignature | string>;

export interface JWTPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  iat?: number;
  nbf?: number;
  exp?: number;
  rexp?: number;
  [x: string]: any;
}

export interface JWTVerifyPolicies {
  now?: number;
  nbf?: boolean;
  iat?: boolean;
  exp?: boolean;
  aud?: boolean;
}

export interface JWTVerified {
  verified: true;
  payload: Partial<JWTPayload>;
  didResolutionResult: DIDResolutionResult;
  issuer: string;
  signer: VerificationMethod;
  jwt: string;
  policies?: JWTVerifyPolicies;
}

// --- did-resolver shapes --------------------------------------------------

export interface DIDResolutionResult {
  "@context"?: "https://w3id.org/did-resolution/v1" | string | string[];
  didResolutionMetadata: DIDResolutionMetadata;
  didDocument: DIDDocument | null;
  didDocumentMetadata: DIDDocumentMetadata;
}

export interface DIDResolutionMetadata {
  contentType?: string;
  error?:
    | "invalidDid"
    | "notFound"
    | "representationNotSupported"
    | "unsupportedDidMethod"
    | string;
  [x: string]: any;
}

export interface DIDDocumentMetadata {
  created?: string;
  updated?: string;
  deactivated?: boolean;
  versionId?: string;
  nextUpdate?: string;
  nextVersionId?: string;
  equivalentId?: string;
  canonicalId?: string;
  [x: string]: any;
}

export type KeyCapabilitySection =
  | "authentication"
  | "assertionMethod"
  | "keyAgreement"
  | "capabilityInvocation"
  | "capabilityDelegation";

export type DIDDocument = {
  "@context"?: "https://www.w3.org/ns/did/v1" | string | string[];
  id: string;
  alsoKnownAs?: string[];
  controller?: string | string[];
  verificationMethod?: VerificationMethod[];
  service?: Service[];
  /** @deprecated */
  publicKey?: VerificationMethod[];
} & {
  [x in KeyCapabilitySection]?: (string | VerificationMethod)[];
};

export interface Service {
  id: string;
  type: string;
  serviceEndpoint: ServiceEndpoint | ServiceEndpoint[];
  [x: string]: any;
}

export type ServiceEndpoint = string | Record<string, any>;

export interface JsonWebKey {
  alg?: string;
  crv?: string;
  e?: string;
  ext?: boolean;
  key_ops?: string[];
  kid?: string;
  kty: string;
  n?: string;
  use?: string;
  x?: string;
  y?: string;
  [x: string]: any;
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyBase58?: string;
  publicKeyBase64?: string;
  publicKeyJwk?: JsonWebKey;
  publicKeyHex?: string;
  publicKeyMultibase?: string;
  blockchainAccountId?: string;
  ethereumAddress?: string;
  conditionOr?: VerificationMethod[];
  conditionAnd?: VerificationMethod[];
  threshold?: number;
  conditionThreshold?: VerificationMethod[];
  conditionWeightedThreshold?: ConditionWeightedThreshold[];
  conditionDelegated?: string;
  relationshipParent?: string[];
  relationshipChild?: string[];
  relationshipSibling?: string[];
}

export interface ConditionWeightedThreshold {
  condition: VerificationMethod;
  weight: number;
}

// --- did-jwt-vc shapes ----------------------------------------------------

export interface Issuer {
  did: string;
  signer: Signer;
  alg?: string;
}

export interface Proof {
  type?: string;
  [x: string]: any;
}

export type Verifiable<T> = Readonly<T> & {
  readonly proof: Proof;
};

export interface CredentialStatus {
  id: string;
  type: string;
}

export type W3CCredential = {
  "@context": string[];
  id?: string;
  type: string[];
  issuer: { id: string; [x: string]: any };
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: {
    id?: string;
    [x: string]: any;
  };
  credentialStatus?: CredentialStatus;
  evidence?: any;
  termsOfUse?: any;
  [x: string]: any;
};

export type VerifiedJWT = JWTVerified;

export type VerifiedCredential = VerifiedJWT & {
  verifiableCredential: Verifiable<W3CCredential>;
};

export type RenownProfile = {
  documentId: string;
  username: string | null;
  ethAddress: string | null;
  userImage: string | null;
  createdAt: string;
  updatedAt: string;
};

// Internal user type for Renown SDK (includes credential and profile)
export type InternalUser = EditorUser & {
  did: string;
  credential: PowerhouseVerifiableCredential | undefined;
  profile?: RenownProfile;
};

// Export as User for backward compatibility within the package
export type User = InternalUser;

/**
 * Strategy function for fetching user profile data.
 * Called after successful authentication to enrich the user object.
 * Should return the user's Renown profile, or undefined if not available.
 * Must not throw — return undefined on failure.
 */
export type ProfileFetcher = (
  user: User,
  baseUrl: string,
) => Promise<RenownProfile | undefined>;

export interface SignInParams {
  /** Ethereum address of the signing wallet. */
  address: `0x${string}`;
  /** Chain id the credential is scoped to. */
  chainId: number;
  /** Wallet/Privy EIP-712 typed-data signer that authorizes the app key. */
  signTypedData: SignCredentialTypedData;
  /** Optional profile username to set on the RenownUser. */
  username?: string;
  /** Optional profile image URL to set on the RenownUser. */
  userImage?: string;
  /** Delegation credential lifetime in days (default 7). */
  expiresInDays?: number;
}

export type Unsubscribe = () => void;

export type LoginStatus =
  | "initial"
  | "checking"
  | "authorized"
  | "not-authorized";

export type RenownStorageMap = { user: InternalUser | undefined };

export type RenownStorage = IStorage<RenownStorageMap>;

export type RenownEvents = {
  user: User | undefined;
  status: LoginStatus;
};

export type RenownEventEmitter = IEventEmitter<RenownEvents>;

export interface IRenown extends Pick<RenownEventEmitter, "on"> {
  readonly baseUrl: string;
  readonly user: User | undefined;
  readonly status: LoginStatus;
  login: (userDid: string) => Promise<User>;
  signIn: (params: SignInParams) => Promise<User>;
  logout: () => Promise<void>;
  readonly crypto: IRenownCrypto;
  readonly signer: ISigner;
  readonly did: string;
  readonly profileFetcher: ProfileFetcher | undefined;
  verifyBearerToken: (token: string) => Promise<false | VerifiedCredential>;
  getBearerToken: (
    options: CreateBearerTokenOptions,
    refresh?: boolean,
  ) => Promise<string>;
}

type IssuerType<T> = {
  id: string;
} & T;

type CredentialSubjecType<T> = {
  id?: string;
} & T;

interface CredentialSchema {
  id: string;
  type: string;
}

interface IVerifiableCredentialPayload<Subject, Issuer> {
  "@context": string[];
  id: string;
  type: string[];
  issuer: IssuerType<Issuer>;
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: CredentialSubjecType<Subject>;
  credentialStatus?: CredentialStatus;
  credentialSchema: CredentialSchema;
}

export interface IProof {
  verificationMethod: string;
  ethereumAddress: `0x${string}`;
  created: string;
  proofPurpose: string;
  type: string;
  proofValue: string;
  eip712: {
    domain: {
      version: string;
      chainId: number;
    };
    types: typeof CREDENTIAL_TYPES;
    primaryType: "VerifiableCredential";
  };
}

export interface IVerifiableCredential<
  Subject,
  Issuer,
> extends IVerifiableCredentialPayload<Subject, Issuer> {
  proof: IProof;
}

export interface IPowerhouseCredentialSubject {
  id: string;
  app: string;
}

export interface IPowerhouseIssuerType {
  ethereumAddress: `0x${string}`;
}

export type PowerhouseVerifiableCredential = IVerifiableCredential<
  IPowerhouseCredentialSubject,
  IPowerhouseIssuerType
>;

export interface IAuthCredentialSubject {
  chainId: number;
  networkId: string;
  address: string;
}

export type AuthVerifiableCredential = IVerifiableCredential<
  IAuthCredentialSubject,
  Record<string, never>
>;

export type AuthVerifiedCredential = VerifiedCredential & {
  verifiableCredential: Verifiable<AuthVerifiableCredential>;
};

export type PKHDid = {
  networkId: string;
  chainId: number;
  address: `0x${string}`;
};

export interface CreateBearerTokenOptions {
  expiresIn?: number;
  aud?: string;
}
