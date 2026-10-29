import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type {
  DocumentChangeEvent,
  InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  createReactorInspector,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import { createClient } from "@powerhousedao/reactor-browser";
import {
  createSwitchboardBackend,
  GraphQLReactorClient,
  GraphQLWrongBackendError,
  switchboardFetch,
  type SwitchboardBackend,
} from "@powerhousedao/reactor-browser/graphql-client";
import {
  fromReactorClient,
  RoutingReactorClient,
  type RoutingClientOptions,
} from "@powerhousedao/reactor-router";
import {
  driveDocumentModelModule,
  setDriveName,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelDocument,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk/node";
import { documentModelDocumentModelModule, setModelName } from "document-model";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const SWITCHBOARD_URL =
  process.env.SWITCHBOARD_URL ?? "http://localhost:4001/graphql";
const BASE_URL = SWITCHBOARD_URL.replace(/\/graphql\/?$/, "");
const DRIVE_TYPE = "powerhouse/document-drive";
const MODEL_TYPE = "powerhouse/document-model";
const SB = "sb";

const sdk = createClient(SWITCHBOARD_URL);
const models = () => [
  driveDocumentModelModule,
  documentModelDocumentModelModule,
];

// A switchboard of this suite's own, to stop mid-test.
const OWN_PORT = Number(process.env.SWITCHBOARD_ROUTER_PORT ?? 4024);
const SWITCHBOARD_BIN = resolve(
  import.meta.dirname,
  "../node_modules/.bin/switchboard",
);

const createdDocumentIds: string[] = [];
const disposables: SwitchboardBackend[] = [];
let local: InProcessReactorClientModule;
let signer: RenownCryptoSigner;

/** `<base>/d/<slug>` -> `<base>/graphql`, as host-core's helper will. */
function graphqlUrlOfDrive(driveAddress: string): string {
  const url = new URL(driveAddress);
  const base = /^(.*)\/d\/[^/]+\/?$/.exec(url.pathname)?.[1];
  if (base === undefined) {
    throw new Error(`${driveAddress} is not a drive address`);
  }
  return `${url.origin}${base}/graphql`;
}

async function createDrive(): Promise<{ id: string; address: string }> {
  const created = await sdk.CreateEmptyDocument({ documentType: DRIVE_TYPE });
  const { id, slug } = created.createEmptyDocument;
  createdDocumentIds.push(id);
  return { id, address: `${BASE_URL}/d/${slug ?? id}` };
}

function switchboardAt(
  driveAddress: string,
  transport?: typeof fetch,
): SwitchboardBackend {
  const remote = createSwitchboardBackend({
    fetch: transport,
    name: SB,
    url: graphqlUrlOfDrive(driveAddress),
    tokenProvider: () => Promise.resolve(undefined),
    signer,
    documentModels: models,
  });
  disposables.push(remote);
  return remote;
}

/** The router Connect builds: the tab's reactor first, then the Switchboard. */
async function routerOver(
  remote: SwitchboardBackend,
  options: Partial<RoutingClientOptions> = {},
) {
  const reactorModule = local.reactorModule;
  if (!reactorModule) {
    throw new Error("The local reactor exposes no module");
  }
  const router = new RoutingReactorClient(
    [
      {
        name: "local",
        backend: fromReactorClient(local.client),
        facts: () => createReactorInspector(reactorModule).info(),
        reach: { hosting: "in-process", inspection: "direct" },
        refusesMisroutes: false,
      },
      remote.config,
    ],
    { primaryBackend: "local", signer, onDiagnostic: () => {}, ...options },
  );
  await router.refreshFacts();
  return router;
}

function routedTo(
  router: RoutingReactorClient,
  identifier: string,
): string | undefined {
  return router
    .describeRouting()
    .documents.find((entry) => entry.identifier === identifier)?.backend;
}

type SentCreate = { driveId: string | null; status: number };

/** The default transport, recording each CreateDocument's Drive-Id and status. */
function recordingFetch(sent: SentCreate[]): typeof fetch {
  return async (input, init) => {
    const response = await switchboardFetch(input, init);
    if (
      typeof init?.body === "string" &&
      init.body.includes("mutation CreateDocument")
    ) {
      sent.push({
        driveId: new Headers(init.headers).get("drive-id"),
        status: response.status,
      });
    }
    return response;
  };
}

async function startOwnSwitchboard(
  port: number,
): Promise<{ proc: ChildProcess; dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), "router-e2e-switchboard-"));
  const proc = spawn(SWITCHBOARD_BIN, [], {
    cwd: dir,
    env: { ...process.env, PH_SWITCHBOARD_PORT: String(port) },
    stdio: "ignore",
  });
  await vi.waitFor(
    async () => {
      const response = await fetch(`http://localhost:${port}/ready`);
      expect(response.status).toBe(200);
    },
    { timeout: 90_000, interval: 250 },
  );
  return { proc, dir };
}

async function stopOwnSwitchboard(
  run: { proc: ChildProcess; dir: string } | undefined,
): Promise<void> {
  if (!run) return;
  if (run.proc.exitCode === null) {
    await new Promise<void>((done) => {
      run.proc.once("close", () => done());
      run.proc.kill();
      setTimeout(() => {
        run.proc.kill("SIGKILL");
        done();
      }, 10_000).unref();
    });
  }
  rmSync(run.dir, { recursive: true, force: true });
}

beforeAll(async () => {
  const renownCrypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  signer = new RenownCryptoSigner(renownCrypto, "router-e2e", {
    address: "0x9aDdcBbaA28F7eB5f75E023F7C1Fcb13C9DFD8F7",
    networkId: "eip155",
    chainId: 1,
  });
  local = await new ReactorClientBuilder()
    .withReactorBuilder(new ReactorBuilder().withDocumentModelSources(models()))
    .withSigner(signer)
    .buildModule();
});

afterEach(() => {
  for (const remote of disposables.splice(0)) {
    remote.dispose();
  }
});

afterAll(async () => {
  local.reactorModule?.reactor.kill();
  for (const id of createdDocumentIds.reverse()) {
    try {
      await sdk.DeleteDocument({ identifier: id });
    } catch {
      // Already gone.
    }
  }
});

describe("a router over a local reactor and a real Switchboard", () => {
  it("reads and writes a Switchboard drive, and the Switchboard accepts the signed actions", async () => {
    const drive = await createDrive();
    const router = await routerOver(switchboardAt(drive.address));

    const read = await router.get<DocumentDriveDocument>(drive.id);
    expect(read.header.id).toBe(drive.id);
    expect(routedTo(router, drive.id)).toBe(SB);

    const renamed = await router.execute<DocumentDriveDocument>(
      drive.id,
      "main",
      [setDriveName({ name: "Routed" })],
    );
    expect(renamed.state.global.name).toBe("Routed");

    const child = await router.createEmpty<DocumentModelDocument>(MODEL_TYPE, {
      parentIdentifier: drive.id,
    });
    createdDocumentIds.push(child.header.id);
    expect(routedTo(router, child.header.id)).toBe(SB);

    const batch = await router.executeBatch({
      jobs: [
        {
          key: "model",
          documentId: child.header.id,
          scope: "global",
          branch: "main",
          actions: [setModelName({ name: "Batched" })],
          dependsOn: [],
        },
        {
          key: "drive",
          documentId: drive.id,
          scope: "global",
          branch: "main",
          actions: [setDriveName({ name: "Batched" })],
          dependsOn: ["model"],
        },
      ],
    });
    expect(Object.values(batch.jobs).map((job) => job.status)).toEqual([
      "READ_READY",
      "READ_READY",
    ]);

    const stored = await new GraphQLReactorClient({
      url: SWITCHBOARD_URL,
      tokenProvider: () => Promise.resolve(undefined),
      realtime: false,
    }).get<DocumentDriveDocument>(drive.id);
    expect(stored.state.global.name).toBe("Batched");
    const operations = await router.getOperations(drive.id);
    const written = operations.results.filter(
      (operation) => operation.action.type === "SET_DRIVE_NAME",
    );
    expect(written).toHaveLength(2);
    for (const operation of written) {
      expect(operation.error).toBeFalsy();
      expect(operation.action.context?.signer?.app.key).toBe(signer.app.key);
      expect(
        operation.action.context?.signer?.signatures.length,
      ).toBeGreaterThan(0);
    }
  });

  it("delivers a change another client writes on the Switchboard", async () => {
    const drive = await createDrive();
    const router = await routerOver(switchboardAt(drive.address));
    await router.get(drive.id);
    const other = new GraphQLReactorClient({
      url: SWITCHBOARD_URL,
      tokenProvider: () => Promise.resolve(undefined),
      signer,
      realtime: false,
    });
    const seen: DocumentChangeEvent[] = [];
    const unsubscribe = router.subscribe({ type: DRIVE_TYPE }, (event) => {
      seen.push(event);
    });

    try {
      // The socket opens in the background; write until a change arrives.
      let attempt = 0;
      await vi.waitFor(
        async () => {
          attempt += 1;
          await other.execute(drive.id, "main", [
            setDriveName({ name: `Written elsewhere ${attempt}` }),
          ]);
          expect(
            seen.some((event) =>
              event.documents.some(
                (document: PHDocument) => document.header.id === drive.id,
              ),
            ),
          ).toBe(true);
        },
        { timeout: 15_000, interval: 1_000 },
      );
    } finally {
      unsubscribe();
    }
  });

  it("opens two drives on one Switchboard through one backend made from a drive address", async () => {
    const first = await createDrive();
    const second = await createDrive();
    expect(graphqlUrlOfDrive(first.address)).toBe(
      graphqlUrlOfDrive(second.address),
    );
    const info = (await (await fetch(first.address)).json()) as { id: string };
    expect(info.id).toBe(first.id);

    const router = await routerOver(switchboardAt(first.address));
    await router.get(first.id);
    await router.get(second.id);

    expect(router.describeRouting().backends).toEqual(["local", SB]);
    expect(routedTo(router, first.id)).toBe(SB);
    expect(routedTo(router, second.id)).toBe(SB);
  });

  it("gets a 421 for a drive deleted on the Switchboard, then stops naming it", async () => {
    const drive = await createDrive();
    const sent: SentCreate[] = [];
    const remote = switchboardAt(drive.address, recordingFetch(sent));
    const router = await routerOver(remote);
    await router.get(drive.id);
    await sdk.DeleteDocument({ identifier: drive.id });
    // The delete returns before every read path drops the drive.
    await vi.waitFor(
      async () => {
        const served = await sdk.GetDocumentServed({ idOrSlug: drive.id });
        expect(served.documentServed).toBe(false);
      },
      { timeout: 15_000, interval: 100 },
    );

    const refused = await remote.config.backend
      .create(documentModelDocumentModelModule.utils.createDocument(), drive.id)
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(
      GraphQLWrongBackendError.isError(refused),
      `expected a 421, got ${String(refused)}`,
    ).toBe(true);
    await remote.config.backend
      .create(documentModelDocumentModelModule.utils.createDocument(), drive.id)
      .catch(() => undefined);

    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual({ driveId: drive.id, status: 421 });
    expect(sent[1].driveId).toBeNull();
    expect(sent[1].status).not.toBe(421);
  });

  it("reads the Switchboard's facts, with the document models it serves", async () => {
    const drive = await createDrive();
    const router = await routerOver(switchboardAt(drive.address));
    const remote = router.backends.find((backend) => backend.name === SB);

    expect(remote?.facts.known).toBe(true);
    expect(remote?.facts.reactor.storage.engine).toBeTruthy();
    // This Switchboard has no model loader, so its model list is closed.
    const loading = await new GraphQLReactorClient({
      url: SWITCHBOARD_URL,
      tokenProvider: () => Promise.resolve(undefined),
      realtime: false,
    }).request<{ inspection: { loadsModelsOnDemand: boolean } }>(
      "query { inspection { loadsModelsOnDemand } }",
    );
    expect(loading.inspection.loadsModelsOnDemand).toBe(false);
    expect([...(remote?.facts.documentTypes ?? [])]).toEqual(
      expect.arrayContaining([DRIVE_TYPE, MODEL_TYPE]),
    );
  });
});

describe("a router whose Switchboard stops", () => {
  const PROBE_TIMEOUT_MS = 3_000;
  let run: { proc: ChildProcess; dir: string } | undefined;

  afterAll(async () => {
    await stopOwnSwitchboard(run);
  }, 30_000);

  it("still completes local creates, and reports the Switchboard down", async () => {
    run = await startOwnSwitchboard(OWN_PORT);
    const ownUrl = `http://localhost:${OWN_PORT}`;
    const remote = createSwitchboardBackend({
      name: SB,
      url: `${ownUrl}/graphql`,
      tokenProvider: () => Promise.resolve(undefined),
      signer,
      documentModels: models,
      realtime: false,
      inspection: "none",
    });
    disposables.push(remote);
    // As Connect places them: new collections on the inspectable local reactor.
    const router = await routerOver(remote, {
      probeTimeoutMs: PROBE_TIMEOUT_MS,
      defaultRequirements: { inspectable: true },
    });
    expect(router.backends[1].facts.known).toBe(true);

    await stopOwnSwitchboard(run);
    run = undefined;

    const started = Date.now();
    const created = await router.createEmpty(MODEL_TYPE);
    expect(Date.now() - started).toBeLessThan(PROBE_TIMEOUT_MS + 500);
    expect(routedTo(router, created.header.id)).toBe("local");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await remote.config.backend.isServed("any").catch(() => undefined);
    }
    expect(router.describeRouting().health).toEqual([
      { backend: SB, health: "down" },
    ]);
    const second = await router.createEmpty(MODEL_TYPE);
    expect(routedTo(router, second.header.id)).toBe("local");
  }, 120_000);
});
