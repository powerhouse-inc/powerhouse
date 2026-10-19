// A trigger that does not resolve arms nothing, and says why on its trigger
// row, with a retry only when a source could not be asked. Real supervisor.
import type { OperationWithContext } from "document-model";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  startPieceSources,
  versionedPiece,
  type FixturePiece,
  type PieceSources,
} from "../../test/helpers/piece-sources.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { packagePieces } from "./piece-registry.js";
import type { WorkflowRuntimeService } from "./service.js";
import type { TriggerStateRow, WorkflowRunStore } from "./store.js";
import { CORE_PIECE_NAME, CORE_PIECE_VERSION } from "../pieces/index.js";

const PIECE = "@acme/piece-inbox";
interface TriggerFields {
  pieceName: string;
  pieceVersion: string;
  triggerName: string;
}

const pinned = (pieceVersion: string): TriggerFields => ({
  pieceName: PIECE,
  pieceVersion,
  triggerName: "tick",
});
const UNPINNED = pinned("latest");
// A worker forks and describes the piece before a row lands.
const SETTLE = { timeout: 15_000 };

// Unique per operation: the service dedupes on the ordinal.
let ordinal = 0;

const enabledState = (trigger: TriggerFields) => ({
  name: "Inbox",
  status: "ENABLED",
  version: 1,
  trigger: { id: "t1", ...trigger, config: {} },
  steps: [],
  edges: [],
  variables: [],
});

function workflowOp(
  workflowId: string,
  trigger: TriggerFields,
): OperationWithContext {
  ordinal += 1;
  return {
    operation: {
      index: ordinal,
      timestampUtcMs: `${ordinal}`,
      action: { type: "SET_TRIGGER", input: {} },
      resultingState: JSON.stringify(enabledState(trigger)),
    },
    context: {
      documentId: workflowId,
      documentType: "powerhouse/workflow",
      scope: "global",
      branch: "main",
      ordinal,
    },
  } as unknown as OperationWithContext;
}

let service: WorkflowRuntimeService;
let store: WorkflowRunStore;
let sources: PieceSources | undefined;
let dir = "";
let inbox = "";
let workflowId = "";
let tests = 0;

// An installed copy the worker can actually describe.
async function bundleDir(piece: FixturePiece): Promise<string> {
  const target = join(dir, `${piece.name.replace("/", "-")}-${piece.version}`);
  await mkdir(target, { recursive: true });
  await writeFile(
    join(target, "package.json"),
    JSON.stringify({
      name: piece.name,
      version: piece.version,
      main: "index.js",
    }),
  );
  await writeFile(join(target, "index.js"), piece.code);
  return target;
}

// The trigger row once it reads `status`, from the shared journal.
async function rowWith(
  status: string,
  id = workflowId,
): Promise<TriggerStateRow> {
  await vi.waitFor(async () => {
    const row = await store.getTriggerState(id);
    expect(row?.status, row?.last_error ?? "no row").toBe(status);
  }, SETTLE);
  return (await store.getTriggerState(id))!;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "unresolved-trigger-"));
  inbox = await bundleDir(versionedPiece(PIECE, "2.0.0"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

// A workflow of its own per test: the journal is shared across the file.
beforeEach(async () => {
  tests += 1;
  workflowId = `wf-inbox-${tests}`;
  packagePieces.reset();
  service = testRuntime();
  store = (await service.store())!;
});

afterEach(async () => {
  packagePieces.reset();
  service.shutdown();
  await sources?.stop();
  sources = undefined;
});

describe("a pinned trigger", () => {
  it("runs the installed copy at its exact version", async () => {
    packagePieces.setPieces([
      { name: PIECE, version: "2.0.0", bundleDir: inbox },
    ]);

    await service.onOperations([workflowOp(workflowId, pinned("2.0.0"))]);

    expect(await rowWith("ENABLED")).toMatchObject({
      piece_name: PIECE,
      trigger_name: "tick",
      piece_version: "2.0.0",
      piece_source: "local",
      version_match: "exact",
      last_error: null,
    });
  });

  it("arms the closest version a source has, and records how it matched", async () => {
    sources = await startPieceSources({
      registry: [
        versionedPiece(PIECE, "1.0.0"),
        versionedPiece(PIECE, "1.4.0"),
      ],
    });

    await service.onOperations([workflowOp(workflowId, pinned("1.2.0"))]);

    expect(await rowWith("ENABLED")).toMatchObject({
      piece_version: "1.4.0",
      piece_source: "registry",
      version_match: "compatible",
      version_note: "Pinned 1.2.0 is not available; runs 1.4.0 from registry",
      last_error: null,
    });
  });

  it("reports a piece no source has, with no retry", async () => {
    sources = await startPieceSources({ npm: [] });

    await service.onOperations([workflowOp(workflowId, pinned("1.0.0"))]);

    const row = await rowWith("ERROR");
    expect(row.last_error).toContain(`No source has the piece ${PIECE}`);
    expect(row.next_poll_at).toBeNull();
    expect(row.piece_version).toBeNull();
  });

  it("says a source was unreachable, and comes back once it answers", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const get = () =>
        Promise.resolve({
          header: { id: workflowId, documentType: "powerhouse/workflow" },
          state: { global: enabledState(pinned("1.0.0")) },
        });
      service.shutdown();
      service = testRuntime({
        reactorClient: {
          get,
          find: () => Promise.resolve({ results: [] }),
        },
      } as never);
      store = (await service.store())!;

      // The default test sources refuse every connection.
      await service.onOperations([workflowOp(workflowId, pinned("1.0.0"))]);
      const refused = await rowWith("ERROR");
      expect(refused.last_error).toContain(
        "connectivity failure, not a missing piece",
      );
      expect(refused.next_poll_at).not.toBeNull();

      sources = await startPieceSources({
        npm: [versionedPiece(PIECE, "1.0.0")],
      });
      await vi.advanceTimersByTimeAsync(30_000);
      // The retry fetches, extracts and describes the piece for real.
      vi.useRealTimers();

      expect(await rowWith("ENABLED")).toMatchObject({
        piece_version: "1.0.0",
        piece_source: "npm",
        last_error: null,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a trigger whose version is not exact", () => {
  it("is refused with the reason, and never looked up", async () => {
    sources = await startPieceSources({
      npm: [versionedPiece(PIECE, "1.0.0")],
    });

    await service.onOperations([workflowOp(workflowId, UNPINNED)]);

    const row = await rowWith("ERROR");
    expect(row.last_error).toContain(
      `pins "latest", which is not an exact semver version`,
    );
    expect(row.next_poll_at).toBeNull();
    expect(sources.requests).toEqual([]);
  });

  it("drops the error it recorded once the workflow arms again", async () => {
    await service.onOperations([workflowOp(workflowId, UNPINNED)]);
    expect((await rowWith("ERROR")).last_error).not.toBeNull();

    packagePieces.setPieces([
      { name: PIECE, version: "2.0.0", bundleDir: inbox },
    ]);
    await service.onOperations([workflowOp(workflowId, pinned("2.0.0"))]);

    expect(await rowWith("ENABLED")).toMatchObject({
      piece_version: "2.0.0",
      last_error: null,
      consecutive_failures: 0,
    });
  });
});

describe("a trigger whose strategy is not known for sure", () => {
  it("is ERROR, not polled, when its descriptor cannot be read", async () => {
    packagePieces.setPieces([
      { name: PIECE, version: "2.0.0", bundleDir: join(dir, "missing") },
    ]);

    await service.onOperations([workflowOp(workflowId, pinned("2.0.0"))]);

    const row = await rowWith("ERROR");
    expect(row.last_error).toContain("Could not describe");
    // A read failure may clear up; a retry is scheduled.
    expect(row.next_poll_at).not.toBeNull();
  });

  it("refuses an APP_WEBHOOK trigger without a retry", async () => {
    const fixture = versionedPiece(PIECE, "3.0.0");
    const bundle = await bundleDir({
      ...fixture,
      code: fixture.code.replace('type: "POLLING"', 'type: "APP_WEBHOOK"'),
    });
    packagePieces.setPieces([
      { name: PIECE, version: "3.0.0", bundleDir: bundle },
    ]);

    await service.onOperations([workflowOp(workflowId, pinned("3.0.0"))]);

    const row = await rowWith("ERROR");
    expect(row.last_error).toContain("APP_WEBHOOK");
    expect(row.next_poll_at).toBeNull();
  });
});

describe("a trigger that was never a piece", () => {
  it("records nothing", async () => {
    await service.onOperations([
      workflowOp(workflowId, {
        pieceName: CORE_PIECE_NAME,
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "manual",
      }),
    ]);
    // The supervisor's lane is serial: once a later refusal lands, so has
    // anything queued for the manual workflow.
    const later = `${workflowId}-later`;
    await service.onOperations([workflowOp(later, UNPINNED)]);
    await rowWith("ERROR", later);

    expect(await store.getTriggerState(workflowId)).toBeUndefined();
  });
});
