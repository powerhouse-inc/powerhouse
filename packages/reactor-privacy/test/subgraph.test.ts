import { buildSubgraphSchema } from "@apollo/subgraph";
import {
  driveDocumentModelModule,
  setDriveName,
} from "@powerhousedao/shared/document-drive";
import {
  generateId,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { graphql, type GraphQLSchema } from "graphql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPrivacySubgraph,
  DisclosureService,
  PRIVACY_SUBGRAPH_NAME,
  PrivacySubgraphOpenPolicyError,
  registerSubjectDocumentsReadModel,
  type ErasurePlan,
  type ErasureRequest,
  type IErasureService,
  type PrivacyAuthorization,
  type PrivacySubgraphContext,
} from "../index.js";
import { createP256Signer, signedBy } from "./utils/p256-signer.js";
import {
  createTestDatabase,
  settled,
  startReactor,
  type TestDatabase,
  type TestReactor,
} from "./utils/reactor.js";

const SECRET = "reactor-privacy-test-deployment-secret-0123456789";
const ADMIN = "0xAd00000000000000000000000000000000000Ad0";
const STRANGER = "0x5700000000000000000000000000000000000057";
const SIGNER = "0x5100000000000000000000000000000000000051";

/** The policy strategies' admin-list check, as reactor-api implements it. */
function authorization(
  policy: string,
  admins: string[] = [ADMIN],
): PrivacyAuthorization {
  const lowered = admins.map((a) => a.toLowerCase());
  return {
    config: { policy },
    isSupremeAdmin: (userAddress?: string) =>
      !!userAddress && lowered.includes(userAddress.toLowerCase()),
  };
}

const PLAN: ErasurePlan = {
  maxPurgeOperations: 50_000,
  items: [
    {
      documentId: "child-1",
      expandedFrom: "drive-1",
      live: false,
      operationCount: 12,
      groupReferencers: ["doc-9"],
    },
  ],
};

const REQUEST: ErasureRequest = {
  requestId: "req-1",
  subjectHash: null,
  requestedBy: "hashed-admin",
  requestedAt: new Date("2026-09-29T10:00:00.000Z"),
  deadline: new Date("2026-10-29T10:00:00.000Z"),
  status: "open",
  items: [
    {
      documentId: "child-1",
      status: "waiting",
      allowLarge: true,
      markerOrdinal: null,
      lastError: null,
      updatedAt: new Date("2026-09-29T10:00:01.000Z"),
    },
  ],
};

class FakeErasureService implements IErasureService {
  readonly calls: { method: string; args: unknown[] }[] = [];

  plan(ids: string[]): Promise<ErasurePlan> {
    this.calls.push({ method: "plan", args: [ids] });
    return Promise.resolve(PLAN);
  }

  request(
    ids: string[],
    opts: { requestedBy: string; deadline?: Date; allowLarge?: string[] },
  ): Promise<ErasureRequest> {
    this.calls.push({ method: "request", args: [ids, opts] });
    return Promise.resolve(REQUEST);
  }

  status(requestId: string): Promise<ErasureRequest> {
    this.calls.push({ method: "status", args: [requestId] });
    return Promise.resolve(REQUEST);
  }
}

const FIELDS = {
  disclose: `query { disclose(identifier: "${SIGNER}") {
    subjectHash documents { documentId role firstOrdinal lastOrdinal }
    boundSyncRemotes { name } peerManifests { appKey }
    permissions { table column documentId detail } notCovered } }`,
  erasurePlan: `query { erasurePlan(ids: ["drive-1"]) {
    maxPurgeOperations
    items { documentId expandedFrom live operationCount groupReferencers } } }`,
  erasureRequest: `query { erasureRequest(requestId: "req-1") {
    requestId subjectHash requestedBy requestedAt deadline status
    items { documentId status allowLarge markerOrdinal lastError updatedAt } } }`,
  requestErasure: `mutation { requestErasure(ids: ["drive-1"],
    deadline: "2026-10-29T10:00:00Z", allowLarge: ["child-1"]) {
    requestId requestedAt deadline items { updatedAt } } }`,
} as const;

const CALLERS: [string, PrivacySubgraphContext][] = [
  ["anonymous", {}],
  ["a caller with no address", { user: {} }],
  ["a caller with an empty address", { user: { address: "" } }],
  ["a non-admin", { user: { address: STRANGER } }],
];

describe("privacy subgraph [Postgres]", () => {
  let database: TestDatabase;
  let host: TestReactor;
  let erasure: FakeErasureService;
  let disclosed: string[];
  let schema: GraphQLSchema;
  let documentId: string;

  const run = (source: string, contextValue: PrivacySubgraphContext) =>
    graphql({ schema, source, contextValue });

  beforeAll(async () => {
    database = await createTestDatabase("reactor_privacy_subgraph");
    const signer = await createP256Signer(SIGNER);
    host = await startReactor(database, {
      signer: await createP256Signer(
        "0x0000000000000000000000000000000000000001",
      ),
    });
    await registerSubjectDocumentsReadModel(host.module, {
      deploymentSecret: SECRET,
    });

    const document = withSignaturePolicy(
      driveDocumentModelModule.utils.createDocument(),
      "legacy",
      { id: generateId() },
    );
    documentId = document.header.id;
    await settled(
      host.module,
      (await host.module.reactor.create(document, signer)).id,
    );
    const job = await host.module.reactor.execute(documentId, "main", [
      await signedBy(signer, setDriveName({ name: "one" }), documentId),
    ]);
    await settled(host.module, job.id);

    const real = new DisclosureService(host.db, SECRET);
    disclosed = [];
    erasure = new FakeErasureService();
    const subgraph = createPrivacySubgraph({
      authorizationService: authorization("ADMIN_ONLY"),
      erasure,
      disclosure: {
        disclose(identifier) {
          disclosed.push(identifier);
          return real.disclose(identifier);
        },
      },
    });
    expect(subgraph.name).toBe(PRIVACY_SUBGRAPH_NAME);
    schema = buildSubgraphSchema([
      { typeDefs: subgraph.typeDefs, resolvers: subgraph.resolvers as never },
    ]);
  });

  afterAll(async () => {
    try {
      await host.kill();
    } finally {
      await database.drop();
    }
  });

  describe.each(CALLERS)("refuses %s", (_label, ctx) => {
    it.each(Object.entries(FIELDS))("on %s", async (_field, source) => {
      erasure.calls.length = 0;
      disclosed.length = 0;
      const result = await run(source, ctx);
      expect(result.data).toBeNull();
      expect(result.errors?.map((e) => e.message)).toEqual([
        "Admin access required",
      ]);
      expect(result.errors?.[0].extensions.code).toBe("FORBIDDEN");
      expect(erasure.calls).toEqual([]);
      expect(disclosed).toEqual([]);
    });
  });

  it("refuses a bad deadline only after the admin check", async () => {
    const bad = `mutation { requestErasure(ids: ["d"], deadline: "soon") {
      requestId } }`;
    const anonymous = await run(bad, {});
    expect(anonymous.errors?.[0].extensions.code).toBe("FORBIDDEN");
    const admin = await run(bad, { user: { address: ADMIN } });
    expect(admin.errors?.[0].extensions.code).toBe("BAD_USER_INPUT");
    expect(erasure.calls).toEqual([]);
  });

  describe("serves an admin", () => {
    const admin = { user: { address: ADMIN.toLowerCase() } };

    it("disclose, from the subject index", async () => {
      const result = await run(FIELDS.disclose, admin);
      expect(result.errors).toBeUndefined();
      const disclosure = (
        result.data as {
          disclose: {
            documents: { documentId: string; role: string }[];
            notCovered: string[];
          };
        }
      ).disclose;
      expect(
        disclosure.documents.map(({ documentId, role }) => [documentId, role]),
      ).toEqual([[documentId, "signer"]]);
      expect(disclosure.notCovered.length).toBeGreaterThan(0);
      expect(disclosed).toEqual([SIGNER]);
    });

    it("erasurePlan", async () => {
      erasure.calls.length = 0;
      const result = await run(FIELDS.erasurePlan, admin);
      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ erasurePlan: PLAN });
      expect(erasure.calls).toEqual([{ method: "plan", args: [["drive-1"]] }]);
    });

    it("erasureRequest", async () => {
      erasure.calls.length = 0;
      const result = await run(FIELDS.erasureRequest, admin);
      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({
        erasureRequest: {
          ...REQUEST,
          requestedAt: "2026-09-29T10:00:00.000Z",
          deadline: "2026-10-29T10:00:00.000Z",
          items: [
            { ...REQUEST.items[0], updatedAt: "2026-09-29T10:00:01.000Z" },
          ],
        },
      });
      expect(erasure.calls).toEqual([{ method: "status", args: ["req-1"] }]);
    });

    it("requestErasure, as the caller", async () => {
      erasure.calls.length = 0;
      const result = await run(FIELDS.requestErasure, admin);
      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({
        requestErasure: {
          requestId: "req-1",
          requestedAt: "2026-09-29T10:00:00.000Z",
          deadline: "2026-10-29T10:00:00.000Z",
          items: [{ updatedAt: "2026-09-29T10:00:01.000Z" }],
        },
      });
      expect(erasure.calls).toEqual([
        {
          method: "request",
          args: [
            ["drive-1"],
            {
              requestedBy: ADMIN.toLowerCase(),
              deadline: new Date("2026-10-29T10:00:00.000Z"),
              allowLarge: ["child-1"],
            },
          ],
        },
      ]);
    });

    it("requestErasure with no deadline or allowLarge", async () => {
      erasure.calls.length = 0;
      const result = await run(
        `mutation { requestErasure(ids: ["d"]) { requestId } }`,
        admin,
      );
      expect(result.errors).toBeUndefined();
      expect(erasure.calls).toEqual([
        {
          method: "request",
          args: [
            ["d"],
            {
              requestedBy: ADMIN.toLowerCase(),
              deadline: undefined,
              allowLarge: undefined,
            },
          ],
        },
      ]);
    });
  });
});

describe("privacy subgraph mounting", () => {
  const deps = {
    erasure: new FakeErasureService(),
    disclosure: { disclose: () => Promise.reject(new Error("unused")) },
  };

  it("is not created under OPEN", () => {
    const open: PrivacyAuthorization = {
      config: { policy: "OPEN" },
      isSupremeAdmin: () => true,
    };
    expect(() =>
      createPrivacySubgraph({ ...deps, authorizationService: open }),
    ).toThrow(PrivacySubgraphOpenPolicyError);
  });

  it("is not created under OPEN even with an admin list", () => {
    expect(() =>
      createPrivacySubgraph({
        ...deps,
        authorizationService: authorization("OPEN"),
      }),
    ).toThrow(PrivacySubgraphOpenPolicyError);
  });

  it("is not created under any policy that makes anonymous an admin", () => {
    const lax: PrivacyAuthorization = {
      config: { policy: "DOCUMENT_PERMISSIONS" },
      isSupremeAdmin: () => true,
    };
    expect(() =>
      createPrivacySubgraph({ ...deps, authorizationService: lax }),
    ).toThrow(PrivacySubgraphOpenPolicyError);
  });

  it.each(["ADMIN_ONLY", "DOCUMENT_PERMISSIONS"])(
    "is created under %s",
    (policy) => {
      const subgraph = createPrivacySubgraph({
        ...deps,
        authorizationService: authorization(policy),
      });
      expect(Object.keys(subgraph.resolvers.Query)).toEqual([
        "disclose",
        "erasurePlan",
        "erasureRequest",
      ]);
      expect(Object.keys(subgraph.resolvers.Mutation)).toEqual([
        "requestErasure",
      ]);
    },
  );
});
