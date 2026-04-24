import type {
  User as EditorUser,
  ISigner,
} from "@powerhousedao/shared/document-model";
import type { CREDENTIAL_TYPES } from "./constants.js";
import type { IRenownCrypto } from "./crypto/types.js";
import type { IEventEmitter } from "./event/types.js";
import type { IStorage } from "./storage/common.js";

export type { ISigner };

// Local mirrors of the did-jwt-vc shapes that would otherwise leak across
// renown's public .d.ts surface. Re-declaring them keeps consumers from
// having to resolve did-jwt-vc / did-jwt / multibase types transitively.

/** Signs bytes/string payloads, returning a base64url-encoded signature. */
export type Signer = (data: string | Uint8Array) => Promise<string>;

/** A DID with an attached signer, used to issue verifiable credentials. */
export interface Issuer {
  did: string;
  signer: Signer;
  alg?: string;
}

/** Credential proof block. */
export interface Proof {
  type?: string;
  [x: string]: unknown;
}

/** Readonly verifiable object carrying a {@link Proof}. */
export type Verifiable<T> = Readonly<T> & {
  readonly proof: Proof;
};

/** Result of a successful credential verification. */
export interface VerifiedCredential {
  readonly payload: { readonly exp?: number };
  readonly verifiableCredential: {
    readonly credentialSubject: { readonly [x: string]: unknown };
  };
}

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

interface CredentialStatus {
  id: string;
  type: string;
}

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
      name: string;
      version: string;
      chainId: number;
      verifyingContract: string;
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
  name?: string;
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
  {}
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
