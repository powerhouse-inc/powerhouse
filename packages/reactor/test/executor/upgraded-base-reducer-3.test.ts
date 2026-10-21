import type {
  Action,
  DocumentModelModule,
  PHBaseState,
  PHDocument,
  StateReducer,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import {
  createPresignedHeader,
  createReducer,
  generateActionId,
  generateId,
  hashDocumentStateForScope,
  retract,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { upgradeDocumentAction } from "../../src/actions/index.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import { JobStatus } from "../../src/shared/types.js";
import {
  authorRetraction,
  createUndoV3ReactorBuilder,
  withBaseReducer3,
} from "../factories.js";
import { assertOneRuleAgreement, storedRows } from "./one-rule-agreement.js";

const LOG_TYPE = "test/upgraded-log";

type LogState = PHBaseState & {
  global: { log: string[] };
  local: Record<string, never>;
};

function initialState(version: number): LogState {
  return {
    global: { log: [] },
    local: {},
    auth: { version: 0, grants: [] },
    document: { version, hash: { algorithm: "sha256", encoding: "hex" } },
  } as unknown as LogState;
}

// LOG records the version that applied it; OLD exists only in version 1.
function logReducer(version: number): StateReducer<LogState> {
  return (state, action) => {
    const entry = (action.input as { entry?: string } | undefined)?.entry;
    if (action.type === "LOG") {
      state.global.log.push(`v${version}:${entry}`);
    } else if (action.type === "OLD") {
      if (version > 1) throw new Error("OLD was removed in version 2");
      state.global.log.push(`v${version}:old`);
    }
    return undefined;
  };
}

function moduleAt(version: number): DocumentModelModule {
  return {
    version,
    reducer: createReducer(logReducer(version)),
    actions: {},
    utils: {
      createDocument: () => ({
        header: createPresignedHeader(generateId(), LOG_TYPE),
        state: initialState(version),
        initialState: initialState(version),
        operations: { global: [], local: [] },
        clipboard: [],
      }),
      createState: () => initialState(version),
    },
    documentModel: {
      global: {
        id: LOG_TYPE,
        name: "Upgraded log",
        description: "",
        extension: "log",
        author: { name: "Test", website: "" },
        specifications: [{ version, changeLog: [] }],
      },
      local: {},
    },
  } as unknown as DocumentModelModule;
}

// Rewrites initialState too, so deriving from the head's initialState shows.
const upgradeManifest: UpgradeManifest<readonly [1, 2]> = {
  documentType: LOG_TYPE,
  latestVersion: 2,
  supportedVersions: [1, 2] as const,
  upgrades: {
    v2: {
      toVersion: 2,
      upgradeReducer: (document: PHDocument) => {
        const state = document.state as LogState;
        return {
          ...document,
          state: {
            ...state,
            global: { log: [...state.global.log, "upgraded"] },
          },
          initialState: {
            ...document.initialState,
            global: { log: ["v2-initial"] },
          },
        };
      },
    },
  },
};

function action(type: string, entry?: string): Action {
  return {
    id: generateActionId(),
    type,
    input: entry === undefined ? {} : { entry },
    scope: "global",
    timestampUtcMs: new Date().toISOString(),
  };
}

let module: InProcessReactorModule | undefined;

afterEach(() => {
  module?.reactor.kill();
  module = undefined;
});

async function settled(jobId: string): Promise<string | undefined> {
  await vi.waitUntil(
    async () => {
      const { status } = await module!.reactor.getJobStatus(jobId);
      return status === JobStatus.READ_READY || status === JobStatus.FAILED;
    },
    { timeout: 10_000 },
  );
  const job = await module!.reactor.getJobStatus(jobId);
  return job.status === JobStatus.FAILED
    ? (job.error?.message ?? "failed")
    : undefined;
}

async function run(documentId: string, actions: Action[]): Promise<void> {
  const job = await module!.reactor.execute(documentId, "main", actions);
  expect(await settled(job.id)).toBeUndefined();
}

/** A base-reducer 3 document holding `before` under version 1, then upgraded. */
async function upgradedDocument(
  before: Action[],
  document = withBaseReducer3(moduleAt(1).utils.createDocument(), "legacy"),
): Promise<string> {
  module = await createUndoV3ReactorBuilder({
    modules: [moduleAt(1), moduleAt(2)],
  })
    .withUpgradeManifests([
      upgradeManifest as unknown as UpgradeManifest<readonly number[]>,
    ])
    .withWriteCacheConfig({ keyframeInterval: 2 })
    .buildModule();
  const documentId = document.header.id;
  expect(await settled((await module.reactor.create(document)).id)).toBe(
    undefined,
  );
  await run(documentId, before);
  const served = await module.reactor.get<PHDocument>(documentId);
  await run(documentId, [
    upgradeDocumentAction({
      documentId,
      model: LOG_TYPE,
      fromVersion: 1,
      toVersion: 2,
      revision: { ...served.header.revision },
    }),
  ]);
  return documentId;
}

/** The served state and the last row's hash, against a cold rebuild's. */
async function expectServedMatchesCold(documentId: string): Promise<string[]> {
  const served = await module!.reactor.get<PHDocument>(documentId);
  const rows = await storedRows(module!, documentId);
  module!.writeCache.invalidate(documentId);
  const cold = await module!.writeCache.getState(documentId, "global", "main");
  const log = (document: PHDocument) => (document.state as LogState).global.log;

  expect({
    served: log(served),
    hash: rows.at(-1)?.hash,
  }).toEqual({
    served: log(cold),
    hash: hashDocumentStateForScope(cold, "global"),
  });
  return log(cold);
}

describe("base-reducer 3 across a model upgrade", () => {
  it("a RETRACT re-derives each row with its own version's reducer", async () => {
    const a = action("LOG", "a");
    const documentId = await upgradedDocument([a, action("LOG", "b")]);

    await run(documentId, [retract(a.id)]);

    expect(await expectServedMatchesCold(documentId)).toEqual([
      "v1:b",
      "upgraded",
    ]);
  });

  it("undo targets the last row its own version applied", async () => {
    const a = action("LOG", "a");
    const old = action("OLD");
    const documentId = await upgradedDocument([a, old]);

    await run(documentId, [
      await authorRetraction(module!.reactor, documentId),
    ]);

    const rows = await storedRows(module!, documentId);
    expect(rows.at(-1)?.action.input).toEqual({ target: old.id });
    expect(await expectServedMatchesCold(documentId)).toEqual([
      "v1:a",
      "upgraded",
    ]);
  });

  it("the one-rule harness agrees on an upgraded document", async () => {
    const document = withBaseReducer3(
      moduleAt(1).utils.createDocument(),
      "legacy",
    );
    const a = action("LOG", "a");
    const documentId = await upgradedDocument(
      [a, action("OLD"), action("LOG", "b")],
      document,
    );
    await run(documentId, [action("LOG", "c")]);
    await run(documentId, [retract(a.id)]);
    await run(documentId, [
      await authorRetraction(module!.reactor, documentId),
    ]);
    await run(documentId, [action("LOG", "d")]);

    const registry = new DocumentModelRegistry();
    registry.registerModules(moduleAt(1), moduleAt(2));
    registry.registerUpgradeManifests(
      upgradeManifest as unknown as UpgradeManifest<readonly number[]>,
    );
    const { expected } = await assertOneRuleAgreement({
      module: module!,
      document,
      revisions: [3, 4, 5, 6],
      versioned: {
        registry,
        config: {
          reducers: { 1: moduleAt(1).reducer, 2: moduleAt(2).reducer },
          upgradeManifest: upgradeManifest as unknown as UpgradeManifest<
            readonly number[]
          >,
        },
      },
    });
    expect((expected as LogState["global"]).log).toEqual([
      "v1:old",
      "v1:b",
      "upgraded",
      "v2:d",
    ]);
  });

  it("a write after the upgrade re-derives on both sides of it", async () => {
    const documentId = await upgradedDocument([action("LOG", "a")]);
    const c = action("LOG", "c");
    await run(documentId, [c, action("LOG", "d")]);

    await run(documentId, [retract(c.id)]);

    expect(await expectServedMatchesCold(documentId)).toEqual([
      "v1:a",
      "upgraded",
      "v2:d",
    ]);
  });
});
