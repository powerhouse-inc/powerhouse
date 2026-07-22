import {
  createAction,
  type Action,
} from "@powerhousedao/shared/document-model";
import { CREDENTIAL_TYPES } from "./constants.js";
import type {
  PowerhouseVerifiableCredential,
  ProfileFetcher,
  RenownProfile,
} from "./types.js";

// Per-user drive convention shared with the Renown app: `renown-<address>`.
// The read-model ignores driveId, but we pass it for parity.
function userDriveId(address: string): string {
  return `renown-${address.toLowerCase()}`;
}

// Flat row returned by the `renownCredentials` read-model query.
interface ReadRenownCredential {
  documentId: string;
  credentialId: string;
  context: string[];
  type: string[];
  issuerId: string;
  issuerEthereumAddress: string;
  issuanceDate: string;
  expirationDate: string | null;
  credentialSubjectId: string | null;
  credentialSubjectApp: string;
  credentialStatusId: string | null;
  credentialStatusType: string | null;
  credentialSchemaId: string;
  credentialSchemaType: string;
  proofVerificationMethod: string;
  proofEthereumAddress: string;
  proofCreated: string;
  proofPurpose: string;
  proofType: string;
  proofValue: string;
  proofEip712Domain: string;
  proofEip712PrimaryType: string;
  revoked: boolean;
}

// Flat row returned by the `renownUsers` read-model query.
interface ReadRenownUser {
  documentId: string;
  username: string | null;
  ethAddress: string | null;
  userImage: string | null;
  createdAt: string;
  updatedAt: string;
}

const CREDENTIALS_QUERY = /* GraphQL */ `
  query RenownCredentials($input: RenownCredentialsInput!) {
    renownCredentials(input: $input) {
      documentId
      credentialId
      context
      type
      issuerId
      issuerEthereumAddress
      issuanceDate
      expirationDate
      credentialSubjectId
      credentialSubjectApp
      credentialStatusId
      credentialStatusType
      credentialSchemaId
      credentialSchemaType
      proofVerificationMethod
      proofEthereumAddress
      proofCreated
      proofPurpose
      proofType
      proofValue
      proofEip712Domain
      proofEip712PrimaryType
      revoked
    }
  }
`;

const USERS_QUERY = /* GraphQL */ `
  query RenownUsers($input: RenownUsersInput!) {
    renownUsers(input: $input) {
      documentId
      username
      ethAddress
      userImage
      createdAt
      updatedAt
    }
  }
`;

const CREATE_EMPTY_DOCUMENT_MUTATION = /* GraphQL */ `
  mutation CreateEmptyDocument(
    $documentType: String!
    $parentIdentifier: String
  ) {
    createEmptyDocument(
      documentType: $documentType
      parentIdentifier: $parentIdentifier
    ) {
      id
    }
  }
`;

const MUTATE_DOCUMENT_MUTATION = /* GraphQL */ `
  mutation MutateDocument(
    $documentIdentifier: String!
    $actions: [JSONObject!]!
  ) {
    mutateDocument(documentIdentifier: $documentIdentifier, actions: $actions) {
      id
    }
  }
`;

const RENOWN_CREDENTIAL_DOC_TYPE = "powerhouse/renown-credential";
const RENOWN_USER_DOC_TYPE = "powerhouse/renown-user";

// Rebuild the nested EIP-712 verifiable credential from a flat read-model row.
function reshapeCredential(
  row: ReadRenownCredential,
): PowerhouseVerifiableCredential {
  // `proofEip712Domain` is stored as a JSON string ({ version, chainId }).
  const domain = JSON.parse(row.proofEip712Domain) as {
    version: string;
    chainId: number;
  };

  return {
    "@context": row.context,
    type: row.type,
    id: row.credentialId,
    issuer: {
      id: row.issuerId,
      ethereumAddress: row.issuerEthereumAddress as `0x${string}`,
    },
    credentialSubject: {
      id: row.credentialSubjectId ?? "",
      app: row.credentialSubjectApp,
    },
    credentialSchema: {
      id: row.credentialSchemaId,
      type: row.credentialSchemaType,
    },
    ...(row.credentialStatusId
      ? {
          credentialStatus: {
            id: row.credentialStatusId,
            type: row.credentialStatusType ?? "",
          },
        }
      : {}),
    issuanceDate: row.issuanceDate,
    expirationDate: row.expirationDate ?? "",
    proof: {
      type: row.proofType,
      created: row.proofCreated,
      verificationMethod: row.proofVerificationMethod,
      proofPurpose: row.proofPurpose,
      proofValue: row.proofValue,
      ethereumAddress: row.proofEthereumAddress as `0x${string}`,
      eip712: {
        domain,
        types: CREDENTIAL_TYPES,
        primaryType: "VerifiableCredential",
      },
    },
  };
}

// The chain id in a `did:pkh:<net>:<chainId>:<address>` issuer id.
function issuerChainId(issuerId: string): string | undefined {
  return issuerId.split(":")[3];
}

// Reads a Switchboard reactor's `renown-read-model` subgraph directly over
// GraphQL, replacing the Renown Next.js REST proxy. Read-only; plain `fetch`.
export class SwitchboardClient {
  #endpoint: string;

  constructor(endpoint: string) {
    this.#endpoint = endpoint;
  }

  get endpoint() {
    return this.#endpoint;
  }

  async #request<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(this.#endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      throw new Error(`Switchboard request failed: ${response.status}`);
    }
    const body = (await response.json()) as {
      data?: T;
      errors?: { message: string }[];
    };
    if (body.errors?.length) {
      throw new Error(body.errors.map((e) => e.message).join("; "));
    }
    if (!body.data) {
      throw new Error("Switchboard returned no data");
    }
    return body.data;
  }

  // Fetch the active delegation credential for (address, chainId) that delegates
  // to `appDid`: filter by chainId, drop expired, return most recent.
  async getCredential(params: {
    address: string;
    chainId: number;
    appDid: string;
  }): Promise<PowerhouseVerifiableCredential | undefined> {
    const { address, chainId, appDid } = params;
    const { renownCredentials } = await this.#request<{
      renownCredentials: ReadRenownCredential[];
    }>(CREDENTIALS_QUERY, {
      input: {
        driveId: userDriveId(address),
        ethAddress: address.toLowerCase(),
        did: appDid,
        includeRevoked: false,
      },
    });

    const now = Date.now();
    const candidates = renownCredentials
      .filter((row) => issuerChainId(row.issuerId) === String(chainId))
      .filter((row) => {
        if (!row.expirationDate) return true;
        const expiresAt = Date.parse(row.expirationDate);
        return !Number.isNaN(expiresAt) && expiresAt > now;
      })
      .sort((a, b) => Date.parse(b.issuanceDate) - Date.parse(a.issuanceDate));

    const mostRecent = candidates.at(0);
    return mostRecent ? reshapeCredential(mostRecent) : undefined;
  }

  // Look up a Renown profile by ethereum address via the `renownUsers` query.
  async getProfileByAddress(
    address: string,
  ): Promise<RenownProfile | undefined> {
    const { renownUsers } = await this.#request<{
      renownUsers: ReadRenownUser[];
    }>(USERS_QUERY, {
      input: {
        driveId: userDriveId(address),
        ethAddresses: [address.toLowerCase()],
      },
    });

    const user = renownUsers.at(0);
    if (!user) return undefined;
    return {
      documentId: user.documentId,
      username: user.username,
      ethAddress: user.ethAddress,
      userImage: user.userImage,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  // Create an empty document of the given type; returns its document id.
  async createEmptyDocument(
    documentType: string,
    parentIdentifier?: string,
  ): Promise<string> {
    const { createEmptyDocument } = await this.#request<{
      createEmptyDocument: { id: string };
    }>(CREATE_EMPTY_DOCUMENT_MUTATION, { documentType, parentIdentifier });
    return createEmptyDocument.id;
  }

  // Apply reactor action envelopes to a document; returns its document id.
  async mutateDocument(
    documentIdentifier: string,
    actions: Action[],
  ): Promise<string> {
    const { mutateDocument } = await this.#request<{
      mutateDocument: { id: string };
    }>(MUTATE_DOCUMENT_MUTATION, { documentIdentifier, actions });
    return mutateDocument.id;
  }

  // Issue a signed credential: create a renown-credential doc and INIT it.
  async issueCredential(
    credential: PowerhouseVerifiableCredential,
  ): Promise<string> {
    const documentId = await this.createEmptyDocument(
      RENOWN_CREDENTIAL_DOC_TYPE,
    );
    const input: Record<string, unknown> = {
      id: credential.id,
      context: credential["@context"],
      type: credential.type,
      issuer: {
        id: credential.issuer.id,
        ethereumAddress: credential.issuer.ethereumAddress,
      },
      credentialSubject: {
        id: credential.credentialSubject.id,
        app: credential.credentialSubject.app,
      },
      credentialSchema: {
        id: credential.credentialSchema.id,
        type: credential.credentialSchema.type,
      },
      issuanceDate: credential.issuanceDate,
      expirationDate: credential.expirationDate || undefined,
      proof: {
        type: credential.proof.type,
        created: credential.proof.created,
        verificationMethod: credential.proof.verificationMethod,
        proofPurpose: credential.proof.proofPurpose,
        proofValue: credential.proof.proofValue,
        ethereumAddress: credential.proof.ethereumAddress,
        eip712: {
          domain: {
            version: credential.proof.eip712.domain.version,
            chainId: credential.proof.eip712.domain.chainId,
          },
          primaryType: credential.proof.eip712.primaryType,
        },
      },
    };
    await this.mutateDocument(documentId, [createAction("INIT", input)]);
    return documentId;
  }

  // Find the RenownUser for an address or create one; returns its document id.
  async findOrCreateUser(
    address: string,
    profile: { username?: string; userImage?: string } = {},
  ): Promise<string> {
    const updates: Action[] = [];
    if (profile.username !== undefined) {
      updates.push(
        createAction("SET_USERNAME", { username: profile.username }),
      );
    }
    if (profile.userImage !== undefined) {
      updates.push(
        createAction("SET_USER_IMAGE", { userImage: profile.userImage }),
      );
    }

    const existing = await this.getProfileByAddress(address);
    if (existing) {
      if (updates.length)
        await this.mutateDocument(existing.documentId, updates);
      return existing.documentId;
    }

    const documentId = await this.createEmptyDocument(RENOWN_USER_DOC_TYPE);
    await this.mutateDocument(documentId, [
      createAction("SET_ETH_ADDRESS", { ethAddress: address }),
      ...updates,
    ]);
    return documentId;
  }

  // Revoke a credential by its document id.
  async revokeCredential(documentId: string, reason?: string): Promise<void> {
    await this.mutateDocument(documentId, [
      createAction("REVOKE", {
        revokedAt: new Date().toISOString(),
        reason: reason ?? null,
      }),
    ]);
  }

  // A ProfileFetcher backed by this client; used as the default when the
  // direct-switchboard flow is active. The `baseUrl` argument is ignored.
  profileFetcher: ProfileFetcher = (user) =>
    this.getProfileByAddress(user.address).catch(() => undefined);
}
