import { afterEach, describe, expect, it, vi } from "vitest";
import { CREDENTIAL_TYPES } from "../src/constants.js";
import { SwitchboardClient } from "../src/switchboard.js";
import type { PowerhouseVerifiableCredential } from "../src/types.js";

interface ReactorCall {
  query: string;
  variables: Record<string, unknown>;
  authorization?: string;
}

// Route reactor mutations/queries by operation and record request bodies. Any
// request matching an `errors` marker fails, simulating a missing operation.
function mockReactor(
  opts: {
    renownUsers?: unknown[];
    createId?: string;
    errors?: { match: string; message: string }[];
  } = {},
) {
  const calls: ReactorCall[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
    const body = JSON.parse(
      (init?.body as string | undefined) ?? "{}",
    ) as ReactorCall;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ ...body, authorization: headers.Authorization });
    const failure = opts.errors?.find((e) => body.query.includes(e.match));
    if (failure) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ errors: [{ message: failure.message }] }),
          { status: 200 },
        ),
      );
    }
    let data: unknown = {};
    if (body.query.includes("renownUsers")) {
      data = { renownUsers: opts.renownUsers ?? [] };
    } else if (body.query.includes("renown_issueCredential")) {
      data = { renown_issueCredential: opts.createId ?? "doc-new" };
    } else if (body.query.includes("createEmptyDocument")) {
      data = { createEmptyDocument: { id: opts.createId ?? "doc-new" } };
    } else if (body.query.includes("mutateDocument")) {
      data = { mutateDocument: { id: body.variables.documentIdentifier } };
    }
    return Promise.resolve(
      new Response(JSON.stringify({ data }), { status: 200 }),
    );
  });
  return calls;
}

function makeCredential(): PowerhouseVerifiableCredential {
  return {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiableCredential", "RenownCredential"],
    id: "urn:uuid:cred-1",
    issuer: {
      id: `did:pkh:eip155:1:${ADDRESS}`,
      ethereumAddress: ADDRESS as `0x${string}`,
    },
    credentialSubject: { id: APP_DID, app: "test-app" },
    credentialSchema: {
      id: "https://renown.id/schemas/renown-credential/v1",
      type: "JsonSchemaValidator2018",
    },
    issuanceDate: "2024-01-01T00:00:00.000Z",
    expirationDate: "2999-01-01T00:00:00.000Z",
    proof: {
      type: "EthereumEip712Signature2021",
      created: "2024-01-01T00:00:00.000Z",
      verificationMethod: `did:pkh:eip155:1:${ADDRESS}`,
      proofPurpose: "assertionMethod",
      proofValue: "0xsignature",
      ethereumAddress: ADDRESS as `0x${string}`,
      eip712: {
        domain: { version: "1", chainId: 1 },
        types: CREDENTIAL_TYPES,
        primaryType: "VerifiableCredential",
      },
    },
  };
}

// Find the actions applied by the Nth mutateDocument call.
function mutateActions(calls: ReactorCall[], index = 0) {
  const mutations = calls.filter((c) => c.query.includes("mutateDocument"));
  return mutations[index]?.variables.actions as {
    type: string;
    input: Record<string, unknown>;
  }[];
}

const ADDRESS = "0xabcdef0000000000000000000000000000000001";
const APP_DID = "did:key:z6MkApp";

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    documentId: "doc-1",
    credentialId: "urn:uuid:cred-1",
    context: ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiableCredential", "RenownCredential"],
    issuerId: `did:pkh:eip155:1:${ADDRESS}`,
    issuerEthereumAddress: ADDRESS,
    issuanceDate: "2024-01-01T00:00:00.000Z",
    expirationDate: "2999-01-01T00:00:00.000Z",
    credentialSubjectId: APP_DID,
    credentialSubjectApp: "test-app",
    credentialStatusId: null,
    credentialStatusType: null,
    credentialSchemaId: "https://renown.id/schemas/renown-credential/v1",
    credentialSchemaType: "JsonSchemaValidator2018",
    proofVerificationMethod: `did:pkh:eip155:1:${ADDRESS}`,
    proofEthereumAddress: ADDRESS,
    proofCreated: "2024-01-01T00:00:00.000Z",
    proofPurpose: "assertionMethod",
    proofType: "EthereumEip712Signature2021",
    proofValue: "0xsignature",
    proofEip712Domain: JSON.stringify({ version: "1", chainId: 1 }),
    proofEip712PrimaryType: "VerifiableCredential",
    revoked: false,
    ...overrides,
  };
}

function mockGraphql(data: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({ data }), { status: 200 }));
}

describe("SwitchboardClient", () => {
  const client = new SwitchboardClient("http://sb.test/graphql");

  afterEach(() => vi.restoreAllMocks());

  describe("getCredential", () => {
    it("reshapes a flat read-model row into a verifiable credential", async () => {
      mockGraphql({ renownCredentials: [makeRow()] });
      const credential = await client.getCredential({
        address: ADDRESS,
        chainId: 1,
        appDid: APP_DID,
      });
      expect(credential).toBeDefined();
      expect(credential?.id).toBe("urn:uuid:cred-1");
      expect(credential?.["@context"]).toEqual([
        "https://www.w3.org/2018/credentials/v1",
      ]);
      expect(credential?.issuer).toEqual({
        id: `did:pkh:eip155:1:${ADDRESS}`,
        ethereumAddress: ADDRESS,
      });
      expect(credential?.credentialSubject).toEqual({
        id: APP_DID,
        app: "test-app",
      });
      expect(credential?.proof.eip712.domain).toEqual({
        version: "1",
        chainId: 1,
      });
    });

    it("returns the most recent credential by issuanceDate", async () => {
      mockGraphql({
        renownCredentials: [
          makeRow({
            credentialId: "urn:uuid:old",
            issuanceDate: "2024-01-01T00:00:00.000Z",
          }),
          makeRow({
            credentialId: "urn:uuid:new",
            issuanceDate: "2024-06-01T00:00:00.000Z",
          }),
        ],
      });
      const credential = await client.getCredential({
        address: ADDRESS,
        chainId: 1,
        appDid: APP_DID,
      });
      expect(credential?.id).toBe("urn:uuid:new");
    });

    it("filters out credentials for a different chainId", async () => {
      mockGraphql({ renownCredentials: [makeRow()] });
      const credential = await client.getCredential({
        address: ADDRESS,
        chainId: 137,
        appDid: APP_DID,
      });
      expect(credential).toBeUndefined();
    });

    it("drops expired credentials", async () => {
      mockGraphql({
        renownCredentials: [
          makeRow({ expirationDate: "2020-01-01T00:00:00.000Z" }),
        ],
      });
      const credential = await client.getCredential({
        address: ADDRESS,
        chainId: 1,
        appDid: APP_DID,
      });
      expect(credential).toBeUndefined();
    });

    it("returns undefined when no credentials exist", async () => {
      mockGraphql({ renownCredentials: [] });
      const credential = await client.getCredential({
        address: ADDRESS,
        chainId: 1,
        appDid: APP_DID,
      });
      expect(credential).toBeUndefined();
    });
  });

  describe("getProfileByAddress", () => {
    it("maps a read-model user row to a profile", async () => {
      mockGraphql({
        renownUsers: [
          {
            documentId: "user-1",
            username: "alice",
            ethAddress: ADDRESS,
            userImage: "http://img.test/a.png",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-02-01T00:00:00.000Z",
          },
        ],
      });
      const profile = await client.getProfileByAddress(ADDRESS);
      expect(profile).toEqual({
        documentId: "user-1",
        username: "alice",
        ethAddress: ADDRESS,
        userImage: "http://img.test/a.png",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-02-01T00:00:00.000Z",
      });
    });

    it("returns undefined when no user exists", async () => {
      mockGraphql({ renownUsers: [] });
      const profile = await client.getProfileByAddress(ADDRESS);
      expect(profile).toBeUndefined();
    });
  });

  describe("issueCredential", () => {
    it("issues via renown_issueCredential with the credential fields", async () => {
      const calls = mockReactor({ createId: "cred-doc-1" });
      const documentId = await client.issueCredential(makeCredential());

      expect(documentId).toBe("cred-doc-1");
      const issue = calls.find((c) =>
        c.query.includes("renown_issueCredential"),
      );
      const input = issue?.variables.input as {
        id: string;
        credentialSubject: { id: string; app: string };
        proof: { proofValue: string };
      };
      expect(input.id).toBe("urn:uuid:cred-1");
      expect(input.credentialSubject).toEqual({
        id: APP_DID,
        app: "test-app",
      });
      expect(input.proof.proofValue).toBe("0xsignature");
    });

    it("falls back to generic createEmptyDocument + INIT on an older switchboard", async () => {
      const calls = mockReactor({
        createId: "cred-doc-1",
        errors: [
          {
            match: "renown_issueCredential",
            message:
              'Cannot query field "renown_issueCredential" on type "Mutation".',
          },
        ],
      });
      const documentId = await client.issueCredential(makeCredential());

      expect(documentId).toBe("cred-doc-1");
      expect(
        calls.some((c) => c.query.includes("renown_issueCredential")),
      ).toBe(true);
      expect(calls.some((c) => c.query.includes("createEmptyDocument"))).toBe(
        true,
      );
      const [init] = mutateActions(calls);
      expect(init.type).toBe("INIT");
    });

    it("does NOT fall back when the resolver rejects the credential", async () => {
      const calls = mockReactor({
        errors: [
          {
            match: "renown_issueCredential",
            message:
              "Invalid request: EIP-712 proof signature does not match issuer",
          },
        ],
      });

      await expect(client.issueCredential(makeCredential())).rejects.toThrow(
        /signature/i,
      );
      // A resolver rejection must not silently write via the generic path.
      expect(calls.some((c) => c.query.includes("createEmptyDocument"))).toBe(
        false,
      );
    });
  });

  describe("upsertUserProfile", () => {
    it("creates a user and sends the bearer token when none exists", async () => {
      const calls = mockReactor({ renownUsers: [], createId: "user-doc-1" });
      const documentId = await client.upsertUserProfile(
        ADDRESS,
        { username: "alice" },
        { token: "jwt-token" },
      );

      expect(documentId).toBe("user-doc-1");
      expect(calls.some((c) => c.query.includes("createEmptyDocument"))).toBe(
        true,
      );
      const actions = mutateActions(calls);
      expect(actions.map((a) => a.type)).toEqual([
        "SET_ETH_ADDRESS",
        "SET_USERNAME",
      ]);
      // The write carried the bearer token so the switchboard can authorize it.
      const createCall = calls.find((c) =>
        c.query.includes("createEmptyDocument"),
      );
      expect(createCall?.authorization).toBe("Bearer jwt-token");
    });

    it("updates an existing user without creating a document", async () => {
      const calls = mockReactor({
        renownUsers: [{ documentId: "user-doc-9", ethAddress: ADDRESS }],
      });
      const documentId = await client.upsertUserProfile(
        ADDRESS,
        { userImage: "http://img.test/a.png" },
        { token: "jwt-token" },
      );

      expect(documentId).toBe("user-doc-9");
      expect(calls.some((c) => c.query.includes("createEmptyDocument"))).toBe(
        false,
      );
      const actions = mutateActions(calls);
      expect(actions.map((a) => a.type)).toEqual(["SET_USER_IMAGE"]);
    });
  });

  describe("revokeCredential", () => {
    it("applies a REVOKE action to the document", async () => {
      const calls = mockReactor();
      await client.revokeCredential("cred-doc-1", "compromised");
      const [revoke] = mutateActions(calls);
      expect(revoke.type).toBe("REVOKE");
      expect(revoke.input.reason).toBe("compromised");
    });
  });
});
