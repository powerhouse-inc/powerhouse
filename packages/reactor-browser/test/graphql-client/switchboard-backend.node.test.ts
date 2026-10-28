import type { ReactorInfo } from "@powerhousedao/reactor";
import { misrouteOf } from "@powerhousedao/reactor-router";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  actions,
  withSignaturePolicy,
  type Action,
  type ISigner,
  type Signature,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSwitchboardBackend,
  type SwitchboardBackendDescriptor,
} from "../../src/graphql-client/switchboard-backend.js";
import { JOB_NOT_FOUND_ERROR_NAME } from "../../src/reactor-interop.js";
import {
  data,
  DRIVE_TYPE,
  driveIdOf,
  REMOTE_INFO,
  serve,
  settledJob,
  switchboard,
  wrongShard,
  type Received,
  type StubSwitchboard,
} from "./switchboard-stub.js";

const MODEL_TYPE = "powerhouse/document-model";

let stub: StubSwitchboard | undefined;

afterEach(async () => {
  await stub?.close();
  stub = undefined;
});

async function backendOver(
  documents: Record<string, string>,
  override?: Parameters<typeof switchboard>[1],
  descriptor: Partial<SwitchboardBackendDescriptor> = {},
) {
  stub = await serve(switchboard(documents, override));
  const remote = createSwitchboardBackend({
    name: "sb",
    url: stub.url,
    tokenProvider: () => Promise.resolve(undefined),
    signer: undefined,
    documentModels: () => [],
    realtime: false,
    ...descriptor,
  });
  return { stub, remote, backend: remote.config.backend };
}

function factsOf(remote: { config: { facts: unknown } }): Promise<ReactorInfo> {
  return (remote.config.facts as () => Promise<ReactorInfo>)();
}

const modelDocument = (id: string) =>
  withSignaturePolicy(
    documentModelDocumentModelModule.utils.createDocument(),
    "legacy",
    { id },
  );

const driveDocument = (id: string) =>
  withSignaturePolicy(
    driveDocumentModelModule.utils.createDocument(),
    "legacy",
    { id },
  );

const signature: Signature = [
  "1700000007",
  "did:key:test",
  "action-hash",
  "prev-hash",
  "0xdeadbeef",
];

function fakeSigner(name: string) {
  const signAction = vi.fn().mockResolvedValue(signature);
  const signer = {
    user: { address: "0x1", networkId: "eip155", chainId: 1 },
    app: { name, key: `${name}-key` },
    signAction,
  } as unknown as ISigner;
  return { signer, signAction };
}

function pushedActions(received: readonly Received[]): Action[] {
  const entry = received.find(
    (r) => r.body.operationName === "MutateDocumentWithOperations",
  );
  if (!entry) {
    throw new Error("MutateDocumentWithOperations was not sent");
  }
  return (entry.body.variables as { actions: Action[] }).actions;
}

describe("createSwitchboardBackend declares what GraphQL serves", () => {
  it("is a plain object without the members GraphQL cannot serve", async () => {
    const { backend } = await backendOver({});

    expect(Object.getPrototypeOf(backend)).toBe(Object.prototype);
    for (const member of [
      "submit",
      "isDocumentIdTaken",
      "resolveIdOrSlug",
      "evaluateActions",
      "loadBatch",
      "addRelationship",
      "updateRelationship",
      "removeRelationship",
      "moveRelationship",
      "getDocumentModelModules",
      "getDocumentModelModule",
    ]) {
      expect(backend, member).not.toHaveProperty(member);
    }
    expect(backend.supports.pointInTimeViews).toBe(false);
    expect(backend.supports.find({ type: DRIVE_TYPE })).toBe(true);
    expect(backend.supports.find({ ids: ["a"] })).toBe(false);
    expect(backend.supports.find({ type: DRIVE_TYPE }, { revision: 1 })).toBe(
      false,
    );
  });

  it("is a remote that does not refuse misroutes itself", async () => {
    const { remote } = await backendOver({});

    expect(remote.config).toMatchObject({
      name: "sb",
      reach: { hosting: "remote", inspection: "rpc" },
      refusesMisroutes: false,
    });
  });

  it("takes the inspection reach from the descriptor", async () => {
    const { remote } = await backendOver({}, undefined, {
      inspection: "none",
    });

    expect(remote.config.reach).toEqual({
      hosting: "remote",
      inspection: "none",
    });
  });

  it("answers isServed from documentServed", async () => {
    const { backend, stub } = await backendOver({ "drive-1": DRIVE_TYPE });

    expect(await backend.isServed("drive-1")).toBe(true);
    expect(await backend.isServed("drive-2")).toBe(false);
    expect(stub.received.map((r) => r.body.operationName)).toEqual([
      "GetDocumentServed",
      "GetDocumentServed",
    ]);
  });

  it("reads the signature policy and the per-type create versions from createDefaults", async () => {
    const { backend, stub } = await backendOver({}, ({ body }) =>
      body.operationName === "GetCreateDefaults" ||
      body.operationName === "GetCreateProtocolVersions"
        ? data({
            createDefaults: {
              signaturePolicy: "legacy",
              protocolVersions: { "base-reducer": 2 },
            },
          })
        : undefined,
    );

    expect(await backend.getCreateSignaturePolicy()).toBe("legacy");
    expect(
      await backend.getCreateProtocolVersions({
        documentType: "powerhouse/test",
        parentIdentifier: "drive-1",
      }),
    ).toEqual({
      "base-reducer": 2,
    });
    expect(stub.received.map((r) => r.body.operationName)).toEqual([
      "GetCreateDefaults",
      "GetCreateProtocolVersions",
    ]);
  });
});

describe("createSwitchboardBackend facts", () => {
  it("reads the Switchboard's facts from its inspection subgraph", async () => {
    const { remote } = await backendOver({}, ({ body }) =>
      body.operationName === "RemoteReactorInfo"
        ? data({ inspection: { info: { ...REMOTE_INFO, access: null } } })
        : undefined,
    );

    expect(await factsOf(remote)).toEqual({
      ...REMOTE_INFO,
      access: { admin: false, sql: false },
    });
  });

  it("takes access from the server when it reports one", async () => {
    const { remote } = await backendOver({}, ({ body }) =>
      body.operationName === "RemoteReactorInfo"
        ? data({
            inspection: {
              info: { ...REMOTE_INFO, access: { admin: true, sql: false } },
            },
          })
        : undefined,
    );

    expect((await factsOf(remote)).access).toEqual({
      admin: true,
      sql: false,
    });
  });
});

describe("createSwitchboardBackend getJob", () => {
  it("answers a known job", async () => {
    const { backend } = await backendOver({}, ({ body }) =>
      body.operationName === "GetJobStatus"
        ? data({ jobStatus: settledJob("doc-1") })
        : undefined,
    );

    expect(await backend.getJob("job-doc-1")).toMatchObject({
      id: "job-doc-1",
      documentId: "doc-1",
      status: "READ_READY",
    });
  });

  it("answers undefined for the server's unknown-job reply", async () => {
    const { backend } = await backendOver({}, ({ body }) =>
      body.operationName === "GetJobStatus"
        ? data({
            jobStatus: {
              ...settledJob(""),
              status: "FAILED",
              error: "Job not found",
              errorName: JOB_NOT_FOUND_ERROR_NAME,
            },
          })
        : undefined,
    );

    expect(await backend.getJob("job-x")).toBeUndefined();
  });

  it("answers undefined when the server reports no job", async () => {
    const { backend } = await backendOver({}, ({ body }) =>
      body.operationName === "GetJobStatus"
        ? data({ jobStatus: null })
        : undefined,
    );

    expect(await backend.getJob("job-x")).toBeUndefined();
  });
});

describe("createSwitchboardBackend Drive-Id", () => {
  it("names a parent it has read as a drive on a create under it", async () => {
    const { backend, stub } = await backendOver({ "drive-1": DRIVE_TYPE });

    await backend.get("drive-1");
    await backend.create(modelDocument("doc-new"), "drive-1");

    expect(driveIdOf(stub.received, "CreateDocument")).toBe("drive-1");
  });

  it("names nothing for a parent it never saw as a drive", async () => {
    const { backend, stub } = await backendOver({
      "drive-1": DRIVE_TYPE,
      "doc-1": MODEL_TYPE,
    });

    await backend.get("doc-1");
    await backend.create(modelDocument("doc-new"), "drive-1");
    await backend.create(driveDocument("drive-nested"), "drive-1");
    await backend.create(modelDocument("doc-other"), "doc-1");

    for (const entry of stub.received) {
      expect(entry.headers["drive-id"], entry.body.operationName).toBe(
        undefined,
      );
    }
  });

  it("does not name a drive created under a parent by its own id", async () => {
    const { backend, stub } = await backendOver({ "drive-1": DRIVE_TYPE });

    await backend.get("drive-1");
    await backend.create(driveDocument("drive-nested"), "drive-1");

    expect(driveIdOf(stub.received, "CreateDocument")).toBe("drive-1");
  });

  it("names the drive a batch writes to", async () => {
    const { backend, stub } = await backendOver({
      "drive-1": DRIVE_TYPE,
      "doc-1": MODEL_TYPE,
    });

    await backend.find({ type: DRIVE_TYPE });
    await backend.executeBatch({
      jobs: [
        {
          key: "doc",
          documentId: "doc-1",
          scope: "global",
          branch: "main",
          actions: [actions.setName("renamed")],
          dependsOn: [],
        },
        {
          key: "drive",
          documentId: "drive-1",
          scope: "global",
          branch: "main",
          actions: [actions.setName("renamed")],
          dependsOn: ["doc"],
        },
      ],
    });

    expect(driveIdOf(stub.received, "ExecuteBatch")).toBe("drive-1");
  });

  it("surfaces the 421 refusal as a misroute the router recognises", async () => {
    const { backend } = await backendOver(
      { "drive-1": DRIVE_TYPE },
      ({ body, headers }) =>
        body.operationName === "MutateDocumentWithOperations" &&
        headers["drive-id"] === "drive-1"
          ? wrongShard("drive-1")
          : undefined,
    );
    await backend.get("drive-1");

    const error = await backend
      .execute("drive-1", "main", [actions.setName("renamed")])
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );

    expect(misrouteOf(error)).toMatchObject({
      misrouted: true,
      documentId: "drive-1",
    });
  });

  it("stops naming a drive the Switchboard refused", async () => {
    const { backend, stub } = await backendOver(
      { "drive-1": DRIVE_TYPE },
      ({ body, headers }) =>
        body.operationName === "CreateDocument" &&
        headers["drive-id"] === "drive-1"
          ? wrongShard("drive-1")
          : undefined,
    );
    await backend.get("drive-1");
    await expect(
      backend.create(modelDocument("doc-a"), "drive-1"),
    ).rejects.toThrow("421");

    await backend.create(modelDocument("doc-b"), "drive-1");

    // fetch itself resends a 421 once on a new connection, so doc-a may go twice.
    const driveIdsFor = (id: string) =>
      stub.received
        .filter(
          (r) =>
            r.body.operationName === "CreateDocument" &&
            (r.body.variables as { document: { header: { id: string } } })
              .document.header.id === id,
        )
        .map((r) => r.headers["drive-id"]);
    expect(new Set(driveIdsFor("doc-a"))).toEqual(new Set(["drive-1"]));
    expect(driveIdsFor("doc-b")).toEqual([undefined]);
  });
});

describe("createSwitchboardBackend credentials", () => {
  const ambient = fakeSigner("ambient");
  const ambientToken = vi.fn(() => Promise.resolve("ambient-token"));

  beforeEach(() => {
    (globalThis as { window?: unknown }).window = {
      ph: {
        renown: {
          user: { did: "did:ambient" },
          signer: ambient.signer,
          getBearerToken: ambientToken,
        },
      },
    };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    vi.clearAllMocks();
  });

  it("signs with the descriptor's signer, not the ambient one", async () => {
    const explicit = fakeSigner("explicit");
    const { backend, stub } = await backendOver(
      { "doc-1": MODEL_TYPE },
      undefined,
      { signer: explicit.signer },
    );

    await backend.execute("doc-1", "main", [actions.setName("renamed")]);

    expect(explicit.signAction).toHaveBeenCalledTimes(1);
    expect(ambient.signAction).not.toHaveBeenCalled();
    expect(pushedActions(stub.received)[0].context?.signer?.app).toEqual(
      explicit.signer.app,
    );
  });

  it("pushes unsigned without a signer, even with someone logged in", async () => {
    const { backend, stub } = await backendOver({ "doc-1": MODEL_TYPE });

    await backend.execute("doc-1", "main", [actions.setName("renamed")]);

    expect(ambient.signAction).not.toHaveBeenCalled();
    expect(pushedActions(stub.received)[0].context?.signer).toBeUndefined();
  });

  it("sends the descriptor's bearer, not the ambient one", async () => {
    const { backend, stub } = await backendOver(
      { "drive-1": DRIVE_TYPE },
      undefined,
      { tokenProvider: () => Promise.resolve("explicit-token") },
    );

    await backend.isServed("drive-1");

    expect(stub.received[0].headers.authorization).toBe(
      "Bearer explicit-token",
    );
    expect(ambientToken).not.toHaveBeenCalled();
  });
});
