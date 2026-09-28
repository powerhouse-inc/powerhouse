import { afterEach, describe, expect, it, vi } from "vitest";
import { createAction } from "@powerhousedao/shared/document-model";
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
    renownCredentials?: unknown[];
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
    if (body.query.includes("renown_upsertProfile")) {
      data = { renown_upsertProfile: opts.createId ?? "doc-new" };
    } else if (body.query.includes("renown_revokeCredential")) {
      data = { renown_revokeCredential: true };
    } else if (body.query.includes("renownCredentials")) {
      data = { renownCredentials: opts.renownCredentials ?? [] };
    } else if (body.query.includes("renownUsers")) {
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

    // The read model is trusted to filter by `did`/`ethAddress`/`revoked`, but a
    // loose filter must not become an auth bypass, so the binding is re-checked.
    it.each([
      [
        "delegated to a different app DID",
        { credentialSubjectId: "did:key:other" },
      ],
      [
        "issued by a different address in the issuer DID",
        {
          issuerId:
            "did:pkh:eip155:1:0x0000000000000000000000000000000000000002",
        },
      ],
      [
        "issued by a different issuer ethereumAddress",
        { issuerEthereumAddress: "0x0000000000000000000000000000000000000002" },
      ],
      ["revoked", { revoked: true }],
    ])("rejects a credential %s", async (_name, overrides) => {
      mockGraphql({ renownCredentials: [makeRow(overrides)] });
      const credential = await client.getCredential({
        address: ADDRESS,
        chainId: 1,
        appDid: APP_DID,
      });
      expect(credential).toBeUndefined();
    });

    it("matches the address case-insensitively", async () => {
      mockGraphql({ renownCredentials: [makeRow()] });
      const credential = await client.getCredential({
        address: ADDRESS.toUpperCase().replace("0X", "0x"),
        chainId: 1,
        appDid: APP_DID,
      });
      expect(credential?.id).toBe("urn:uuid:cred-1");
    });

    it("reads through a request function without touching fetch", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const request = vi
        .fn()
        .mockResolvedValue({ renownCredentials: [makeRow()] });
      const local = new SwitchboardClient(request);

      const credential = await local.getCredential({
        address: ADDRESS,
        chainId: 1,
        appDid: APP_DID,
      });

      expect(credential?.id).toBe("urn:uuid:cred-1");
      expect(local.endpoint).toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
      const [query, variables] = request.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(query).toContain("renownCredentials");
      expect(variables).toEqual({
        input: {
          driveId: `renown-${ADDRESS.toLowerCase()}`,
          ethAddress: ADDRESS.toLowerCase(),
          did: APP_DID,
          includeRevoked: false,
        },
      });
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

  describe("mutateDocument", () => {
    const UNKNOWN_EXECUTE = {
      errors: [
        {
          message: 'Cannot query field "execute" on type "Mutation".',
          extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
        },
      ],
    };

    // Own instance per test: the fallback is remembered on the client.
    const fresh = () => new SwitchboardClient("http://sb.test/graphql");

    // A pre-dev.54 switchboard: `execute` fails validation, `mutateDocument` works.
    function mockLegacyReactor() {
      const calls: ReactorCall[] = [];
      vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
        const body = JSON.parse(init?.body as string) as ReactorCall;
        calls.push(body);
        if (body.query.includes("execute(")) {
          return Promise.resolve(
            new Response(JSON.stringify(UNKNOWN_EXECUTE), { status: 400 }),
          );
        }
        const data = {
          mutateDocument: { id: body.variables.documentIdentifier },
        };
        return Promise.resolve(
          new Response(JSON.stringify({ data }), { status: 200 }),
        );
      });
      return calls;
    }

    it("falls back to the legacy mutateDocument when the switchboard has no execute", async () => {
      const calls = mockLegacyReactor();
      const action = createAction("INIT", { id: "cred" });

      const id = await fresh().mutateDocument("doc-1", [action]);

      expect(id).toBe("doc-1");
      expect(calls).toHaveLength(2);
      expect(calls[0].query).toContain("execute(");
      expect(calls[1].query).toContain("mutateDocument(");
      expect(calls[1].query).not.toContain("execute");
      expect(calls[1].variables).toEqual({
        documentIdentifier: "doc-1",
        actions: [action],
      });
    });

    it("remembers the fallback instead of probing on every write", async () => {
      const calls = mockLegacyReactor();
      const action = createAction("INIT", { id: "cred" });

      const sb = fresh();
      await sb.mutateDocument("doc-1", [action]);
      await sb.mutateDocument("doc-2", [action]);

      const probes = calls.filter((c) => c.query.includes("execute("));
      expect(probes).toHaveLength(1);
      expect(calls).toHaveLength(3);
    });

    it("surfaces any other rejection instead of retrying", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({ errors: [{ message: "Document not found" }] }),
          { status: 400 },
        ),
      );

      await expect(
        fresh().mutateDocument("doc-1", [createAction("INIT", {})]),
      ).rejects.toThrow("Document not found");
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("reports the status when a failed response carries no GraphQL errors", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Bad Gateway", { status: 502 }),
      );

      await expect(
        fresh().mutateDocument("doc-1", [createAction("INIT", {})]),
      ).rejects.toThrow("Switchboard request failed: 502");
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
    const upsertCall = (calls: ReactorCall[]) =>
      calls.find((c) => c.query.includes("renown_upsertProfile"));

    it("calls renown_upsertProfile with the login token as a bearer", async () => {
      const calls = mockReactor({ createId: "user-doc-1" });
      const documentId = await client.upsertUserProfile(
        ADDRESS,
        { username: "alice" },
        { token: "jwt-token" },
      );

      expect(documentId).toBe("user-doc-1");
      const call = upsertCall(calls);
      expect(call?.variables).toEqual({ address: ADDRESS, username: "alice" });
      expect(call?.authorization).toBe("Bearer jwt-token");
      // One self-authenticating request; nothing through the generic path.
      expect(calls).toHaveLength(1);
    });

    it("sends a personal_sign signature and timestamp without a bearer", async () => {
      const calls = mockReactor({ createId: "user-doc-1" });
      await client.upsertUserProfile(
        ADDRESS,
        { username: "alice", userImage: "http://img.test/a.png" },
        { signature: "0xsig", timestamp: "2026-09-28T12:00:00.000Z" },
      );

      const call = upsertCall(calls);
      expect(call?.variables).toEqual({
        address: ADDRESS,
        username: "alice",
        userImage: "http://img.test/a.png",
        signature: "0xsig",
        timestamp: "2026-09-28T12:00:00.000Z",
      });
      expect(call?.authorization).toBeUndefined();
    });

    it("sends the bearer through a request-function transport", async () => {
      const request = vi.fn(() =>
        Promise.resolve({ renown_upsertProfile: "user-doc-1" }),
      );
      await new SwitchboardClient(request).upsertUserProfile(
        ADDRESS,
        { username: "alice" },
        { token: "jwt-token" },
      );
      expect(request).toHaveBeenCalledWith(
        expect.stringContaining("renown_upsertProfile"),
        { address: ADDRESS, username: "alice" },
        { token: "jwt-token" },
      );
    });

    describe("on a switchboard without renown_upsertProfile", () => {
      const missing = {
        match: "renown_upsertProfile",
        message:
          'Cannot query field "renown_upsertProfile" on type "Mutation".',
      };

      it("falls back to creating the user with the bearer token", async () => {
        const calls = mockReactor({
          renownUsers: [],
          createId: "user-doc-1",
          errors: [missing],
        });
        const documentId = await client.upsertUserProfile(
          ADDRESS,
          { username: "alice" },
          { token: "jwt-token" },
        );

        expect(documentId).toBe("user-doc-1");
        const actions = mutateActions(calls);
        expect(actions.map((a) => a.type)).toEqual([
          "SET_ETH_ADDRESS",
          "SET_USERNAME",
        ]);
        const createCall = calls.find((c) =>
          c.query.includes("createEmptyDocument"),
        );
        expect(createCall?.authorization).toBe("Bearer jwt-token");
      });

      it("falls back to updating an existing user without creating a document", async () => {
        const calls = mockReactor({
          renownUsers: [{ documentId: "user-doc-9", ethAddress: ADDRESS }],
          errors: [missing],
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

    it.each(["Forbidden", "Invalid request: username exceeds 64 characters"])(
      "rethrows a resolver rejection (%s) without falling back",
      async (message) => {
        const calls = mockReactor({
          errors: [{ match: "renown_upsertProfile", message }],
        });

        await expect(
          client.upsertUserProfile(
            ADDRESS,
            { username: "alice" },
            { token: "jwt-token" },
          ),
        ).rejects.toThrow(message);
        expect(calls).toHaveLength(1);
      },
    );
  });

  describe("revokeCredential", () => {
    const revokeCall = (calls: ReactorCall[]) =>
      calls.find((c) => c.query.includes("renown_revokeCredential"));

    it("calls renown_revokeCredential with the login token as a bearer", async () => {
      const calls = mockReactor();
      await client.revokeCredential("urn:uuid:cred-1", { token: "jwt-token" });

      const call = revokeCall(calls);
      expect(call?.variables).toEqual({ credentialId: "urn:uuid:cred-1" });
      expect(call?.authorization).toBe("Bearer jwt-token");
      expect(calls).toHaveLength(1);
    });

    it("sends a personal_sign signature and timestamp without a bearer", async () => {
      const calls = mockReactor();
      await client.revokeCredential("urn:uuid:cred-1", {
        signature: "0xsig",
        timestamp: "2026-09-28T12:00:00.000Z",
      });

      const call = revokeCall(calls);
      expect(call?.variables).toEqual({
        credentialId: "urn:uuid:cred-1",
        signature: "0xsig",
        timestamp: "2026-09-28T12:00:00.000Z",
      });
      expect(call?.authorization).toBeUndefined();
    });

    it("falls back to a REVOKE action on the credential's documents", async () => {
      const calls = mockReactor({
        renownCredentials: [
          makeRow({ documentId: "cred-doc-1" }),
          makeRow({ documentId: "other-doc", credentialId: "urn:uuid:other" }),
        ],
        errors: [
          {
            match: "renown_revokeCredential",
            message:
              'Cannot query field "renown_revokeCredential" on type "Mutation".',
          },
        ],
      });
      await client.revokeCredential("urn:uuid:cred-1", { token: "jwt-token" });

      const mutations = calls.filter((c) => c.query.includes("mutateDocument"));
      expect(mutations).toHaveLength(1);
      expect(mutations[0].variables.documentIdentifier).toBe("cred-doc-1");
      expect(mutations[0].authorization).toBe("Bearer jwt-token");
      const [revoke] = mutateActions(calls);
      expect(revoke.type).toBe("REVOKE");
    });

    it("fails the fallback when no live document holds the credential", async () => {
      mockReactor({
        renownCredentials: [],
        errors: [
          {
            match: "renown_revokeCredential",
            message:
              'Cannot query field "renown_revokeCredential" on type "Mutation".',
          },
        ],
      });
      await expect(
        client.revokeCredential("urn:uuid:cred-1", { token: "jwt-token" }),
      ).rejects.toThrow(/not found/i);
    });

    it.each(["Forbidden", "Not found"])(
      "rethrows a resolver rejection (%s) without falling back",
      async (message) => {
        const calls = mockReactor({
          errors: [{ match: "renown_revokeCredential", message }],
        });

        await expect(
          client.revokeCredential("urn:uuid:cred-1", { token: "jwt-token" }),
        ).rejects.toThrow(message);
        expect(calls).toHaveLength(1);
      },
    );
  });
});
