import type { ReactorInfo } from "@powerhousedao/reactor";
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import {
  fromReactorClient,
  misrouteOf,
  RoutingReactorClient,
  UNKNOWN_REACTOR_INFO,
  UnsupportedByBackendError,
  type RouterDiagnostic,
} from "@powerhousedao/reactor-router";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  actions,
  withSignaturePolicy,
  type Action,
  type DocumentModelModule,
  type ISigner,
  type Signature,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSwitchboardBackend,
  SwitchboardUnreachableError,
  type SwitchboardBackend,
  type SwitchboardBackendDescriptor,
} from "../../src/graphql-client/switchboard-backend.js";
import { isDeadlineError } from "../../src/graphql-client/transport.js";
import { JOB_NOT_FOUND_ERROR_NAME } from "../../src/reactor-interop.js";
import {
  data,
  DRIVE_TYPE,
  driveIdOf,
  REMOTE_INFO,
  serve,
  modelLoading,
  serveHanging,
  settledJob,
  switchboard,
  switchboardFacts,
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

function routerOver(
  remote: SwitchboardBackend,
  onDiagnostic: RouterDiagnostic = () => {},
) {
  return new RoutingReactorClient([remote.config], {
    onDiagnostic,
    documentModelModules: [
      documentModelDocumentModelModule as unknown as DocumentModelModule,
    ],
  });
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
  const factsReply =
    (over: Parameters<typeof switchboardFacts>[0]) =>
    ({ body }: Received) =>
      body.operationName === "SwitchboardFacts"
        ? data(switchboardFacts(over))
        : undefined;

  it("reads the Switchboard's facts from its inspection subgraph", async () => {
    const { remote } = await backendOver({});

    expect(await factsOf(remote)).toEqual({
      ...REMOTE_INFO,
      access: { admin: false, sql: false },
    });
  });

  it("takes access from the server when it reports one", async () => {
    const { remote } = await backendOver(
      {},
      factsReply({ info: { access: { admin: true, sql: false } } }),
    );

    expect((await factsOf(remote)).access).toEqual({
      admin: true,
      sql: false,
    });
  });

  it("lists the Switchboard's document types, in the same request as its facts", async () => {
    const { remote, stub } = await backendOver(
      {},
      factsReply({ documentTypes: [DRIVE_TYPE, "powerhouse/test"] }),
    );
    const router = routerOver(remote);

    await router.refreshFacts();

    expect([...(router.backends[0].facts.documentTypes ?? [])]).toEqual([
      DRIVE_TYPE,
      "powerhouse/test",
    ]);
    expect(router.backends[0].facts.known).toBe(true);
    expect(
      stub.received.filter((r) => r.body.operationName === "SwitchboardFacts"),
    ).toHaveLength(1);
  });

  it("is unknown when the Switchboard lacks a query this backend sends", async () => {
    const { remote } = await backendOver(
      {},
      factsReply({ queries: ["inspection", "createDefaults"] }),
    );
    const diagnostics: string[] = [];
    const router = routerOver(remote, (message) => diagnostics.push(message));

    await expect(factsOf(remote)).rejects.toThrow(
      "does not serve documentServed",
    );
    await router.refreshFacts();

    expect(router.backends[0].facts.known).toBe(false);
    expect(diagnostics.join("\n")).toContain("documentServed");
  });

  it("refuses a create of a type the Switchboard lacks, sending nothing", async () => {
    const { remote, stub } = await backendOver(
      { "drive-1": DRIVE_TYPE },
      factsReply({ documentTypes: [DRIVE_TYPE] }),
    );
    const router = routerOver(remote);
    await router.refreshFacts();

    await expect(
      router.create(modelDocument("doc-new"), "drive-1"),
    ).rejects.toThrow(UnsupportedByBackendError);
    expect(
      stub.received.some((r) => r.body.operationName === "CreateDocument"),
    ).toBe(false);
  });

  it("leaves types open on a Switchboard that loads models on demand, and sends the create", async () => {
    const { remote, stub } = await backendOver(
      { "drive-1": DRIVE_TYPE },
      ({ body }) =>
        body.operationName === "SwitchboardFacts"
          ? data(switchboardFacts({ documentTypes: [DRIVE_TYPE] }))
          : body.operationName === "SwitchboardModelLoading"
            ? data(modelLoading(true))
            : undefined,
    );
    const router = routerOver(remote);
    await router.refreshFacts();

    const facts = router.backends[0].facts;
    expect(facts.known).toBe(true);
    expect(facts.documentTypes).toBeUndefined();
    await router.create(modelDocument("doc-new"), "drive-1");
    expect(
      stub.received.some((r) => r.body.operationName === "CreateDocument"),
    ).toBe(true);
  });

  it("leaves types open on a Switchboard too old to say how it loads models", async () => {
    const { remote, stub } = await backendOver(
      { "drive-1": DRIVE_TYPE },
      factsReply({ documentTypes: [DRIVE_TYPE], onDemand: "unreported" }),
    );
    const router = routerOver(remote);
    await router.refreshFacts();

    const facts = router.backends[0].facts;
    expect(facts.known).toBe(true);
    expect(facts.documentTypes).toBeUndefined();
    expect(stub.received.map((r) => r.body.operationName)).not.toContain(
      "SwitchboardModelLoading",
    );
    await router.create(modelDocument("doc-new"), "drive-1");
    expect(
      stub.received.some((r) => r.body.operationName === "CreateDocument"),
    ).toBe(true);
  });
});

describe("createSwitchboardBackend request deadline", () => {
  it("rejects a request the Switchboard never answers at the deadline", async () => {
    const hanging = await serveHanging();
    const remote = createSwitchboardBackend({
      name: "sb",
      url: hanging.url,
      tokenProvider: () => Promise.resolve(undefined),
      signer: undefined,
      documentModels: () => [],
      realtime: false,
      requestTimeoutMs: 200,
    });
    const started = Date.now();
    try {
      const error = await remote.config.backend.get("doc-1").then(
        () => undefined,
        (reason: unknown) => reason,
      );

      expect(isDeadlineError(error)).toBe(true);
      expect(Date.now() - started).toBeLessThan(2_000);
    } finally {
      await hanging.close();
    }
  });
});

describe("createSwitchboardBackend breaker", () => {
  const BREAKER = { failures: 3, openMs: 300 };
  const serverError = { status: 500, body: "boom" };
  const graphqlError = data(null);
  const failing = (reply: { status: number; body: string }) => () => reply;

  it("opens after three transport failures and sends nothing while open", async () => {
    const { remote, backend, stub } = await backendOver(
      {},
      failing(serverError),
      { breaker: BREAKER },
    );
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(backend.isServed("doc-1")).rejects.toThrow();
    }
    const sent = stub.received.length;

    expect(backend.health?.()).toBe("down");
    await expect(backend.isServed("doc-1")).rejects.toThrow(
      SwitchboardUnreachableError,
    );
    await expect(factsOf(remote)).rejects.toThrow(SwitchboardUnreachableError);
    expect(stub.received).toHaveLength(sent);
  });

  it("never opens when the breaker is off", async () => {
    const { backend, stub } = await backendOver({}, failing(serverError), {
      breaker: false,
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(backend.isServed("doc-1")).rejects.toThrow();
    }

    expect(backend.health?.()).toBe("up");
    expect(stub.received).toHaveLength(5);
  });

  it("takes the default for a breaker field left unset", async () => {
    const { backend } = await backendOver({}, failing(serverError), {
      breaker: { openMs: 60_000 },
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(backend.isServed("doc-1")).rejects.toThrow();
    }
    expect(backend.health?.()).toBe("up");

    await expect(backend.isServed("doc-1")).rejects.toThrow();
    expect(backend.health?.()).toBe("down");
  });

  it("does not open on GraphQL errors, which are answers", async () => {
    const { backend } = await backendOver({}, failing(graphqlError), {
      breaker: BREAKER,
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(backend.isServed("doc-1")).rejects.toThrow();
    }

    expect(backend.health?.()).toBe("up");
  });

  it("does not count a request its caller aborted", async () => {
    const hanging = await serveHanging();
    const remote = createSwitchboardBackend({
      name: "sb",
      url: hanging.url,
      tokenProvider: () => Promise.resolve(undefined),
      signer: undefined,
      documentModels: () => [],
      realtime: false,
      breaker: { failures: 1, openMs: 60_000 },
    });
    try {
      const controller = new AbortController();
      const read = remote.config.backend.isServed(
        "doc-1",
        undefined,
        controller.signal,
      );
      controller.abort();
      await expect(read).rejects.toThrow();

      expect(remote.config.backend.health?.()).toBe("up");
    } finally {
      await hanging.close();
    }
  });

  it("opens on the router's probe deadlines, so a hung Switchboard stops holding local creates", async () => {
    const PROBE_TIMEOUT_MS = 300;
    const hanging = await serveHanging();
    const local = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          documentModelDocumentModelModule as unknown as DocumentModelModule,
        ]),
      )
      .buildModule();
    const remote = createSwitchboardBackend({
      name: "sb",
      url: hanging.url,
      tokenProvider: () => Promise.resolve(undefined),
      signer: undefined,
      documentModels: () => [],
      realtime: false,
      inspection: "none",
      requestTimeoutMs: 5_000,
      breaker: { failures: 3, openMs: 60_000 },
    });
    const diagnostics: string[] = [];
    const router = new RoutingReactorClient(
      [
        {
          name: "local",
          backend: fromReactorClient(local.client),
          facts: UNKNOWN_REACTOR_INFO,
          reach: { hosting: "in-process", inspection: "direct" },
          refusesMisroutes: false,
        },
        remote.config,
      ],
      {
        primaryBackend: "local",
        defaultRequirements: { inspectable: true },
        probeTimeoutMs: PROBE_TIMEOUT_MS,
        onDiagnostic: (message) => diagnostics.push(message),
      },
    );
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await router.create(modelDocument(`held-${attempt}`));
      }
      expect(hanging.received).toHaveLength(3);
      expect(router.describeRouting().health).toEqual([
        { backend: "sb", health: "down" },
      ]);

      // With the breaker open the create sends no probe, so none can time out.
      diagnostics.length = 0;
      const created = await router.create(modelDocument("after-open"));

      expect(hanging.received).toHaveLength(3);
      expect(diagnostics.filter((message) => message.includes("sb"))).toEqual(
        [],
      );
      expect(
        router
          .describeRouting()
          .documents.find((entry) => entry.identifier === created.header.id)
          ?.backend,
      ).toBe("local");
    } finally {
      local.reactorModule?.reactor.kill();
      await hanging.close();
    }
  });

  it("lets a request through after openMs and closes when it is answered", async () => {
    let broken = true;
    const { backend } = await backendOver(
      { "doc-1": MODEL_TYPE },
      () => (broken ? serverError : undefined),
      { breaker: BREAKER },
    );
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(backend.isServed("doc-1")).rejects.toThrow();
    }
    expect(backend.health?.()).toBe("down");

    broken = false;
    await new Promise((resolve) => setTimeout(resolve, BREAKER.openMs + 50));

    expect(backend.health?.()).toBe("up");
    expect(await backend.isServed("doc-1")).toBe(true);
    expect(backend.health?.()).toBe("up");
  });

  it("opens again on the first failure after openMs", async () => {
    const { backend } = await backendOver({}, failing(serverError), {
      breaker: BREAKER,
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(backend.isServed("doc-1")).rejects.toThrow();
    }
    await new Promise((resolve) => setTimeout(resolve, BREAKER.openMs + 50));

    await expect(backend.isServed("doc-1")).rejects.toThrow();

    expect(backend.health?.()).toBe("down");
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

    // Sent once: Node's fetch resends a 421 with a buffered body, and the
    // backend streams bodies so the 421 comes back as itself.
    const driveIdsFor = (id: string) =>
      stub.received
        .filter(
          (r) =>
            r.body.operationName === "CreateDocument" &&
            (r.body.variables as { document: { header: { id: string } } })
              .document.header.id === id,
        )
        .map((r) => r.headers["drive-id"]);
    expect(driveIdsFor("doc-a")).toEqual(["drive-1"]);
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
