// A trigger that does not resolve arms nothing, and says why: in the log and
// on the trigger row, with a retry only when a source could not be asked.
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
import type { PieceTriggerBinding } from "./trigger-supervisor.js";
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
const WORKFLOW = "wf-inbox";

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

function workflowOp(trigger: TriggerFields): OperationWithContext {
  ordinal += 1;
  return {
    operation: {
      index: ordinal,
      timestampUtcMs: `${ordinal}`,
      action: { type: "SET_TRIGGER", input: {} },
      resultingState: JSON.stringify(enabledState(trigger)),
    },
    context: {
      documentId: WORKFLOW,
      documentType: "powerhouse/workflow",
      scope: "global",
      branch: "main",
      ordinal,
    },
  } as unknown as OperationWithContext;
}

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
  child: vi.fn(),
};

// What this suite reads is which binding the supervisor is handed, if any.
const upsert = vi.fn((_binding: PieceTriggerBinding) => Promise.resolve());
const reject = vi.fn(
  (
    _workflowId: string,
    _block: unknown,
    _config: unknown,
    _message: string,
    _retryAt?: Date,
  ) => Promise.resolve(),
);
const remove = vi.fn((_workflowId: string) => Promise.resolve());

let service: WorkflowRuntimeService;
let sources: PieceSources | undefined;
let dir = "";
let inbox = "";

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

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "unresolved-trigger-"));
  inbox = await bundleDir(versionedPiece(PIECE, "2.0.0"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const armed = (): PieceTriggerBinding => upsert.mock.calls.at(-1)![0];
const reason = () => String(reject.mock.calls.at(-1)?.[3]);

beforeEach(() => {
  vi.clearAllMocks();
  packagePieces.reset();
  service = testRuntime({ logger } as never);
  (service as unknown as { triggerSupervisor: unknown }).triggerSupervisor = {
    upsert,
    reject,
    remove,
    stop: vi.fn(),
  };
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

    await service.onOperations([workflowOp(pinned("2.0.0"))]);

    expect(armed()).toMatchObject({
      version: "2.0.0",
      source: "local",
      match: "exact",
      triggerName: "tick",
    });
    expect(reject).not.toHaveBeenCalled();
  });

  it("arms the closest version a source has, and records how it matched", async () => {
    sources = await startPieceSources({
      registry: [
        versionedPiece(PIECE, "1.0.0"),
        versionedPiece(PIECE, "1.4.0"),
      ],
    });

    await service.onOperations([workflowOp(pinned("1.2.0"))]);

    expect(armed()).toMatchObject({
      version: "1.4.0",
      source: "registry",
      match: "compatible",
      note: "Pinned 1.2.0 is not available; runs 1.4.0 from registry",
    });
    expect(reject).not.toHaveBeenCalled();
  });

  it("reports a piece no source has, with no retry", async () => {
    sources = await startPieceSources({ npm: [] });

    await service.onOperations([workflowOp(pinned("1.0.0"))]);

    expect(upsert).not.toHaveBeenCalled();
    expect(reason()).toContain(`No source has the piece ${PIECE}`);
    expect(reject.mock.calls[0]![4]).toBeUndefined();
    const warned = logger.warn.mock.calls.find((call) =>
      String(call[0]).includes("@reason"),
    );
    expect(warned?.[1]).toBe(WORKFLOW);
  });

  it("says a source was unreachable, and comes back once it answers", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const get = vi.fn(() =>
        Promise.resolve({
          header: { id: WORKFLOW, documentType: "powerhouse/workflow" },
          state: { global: enabledState(pinned("1.0.0")) },
        }),
      );
      (
        service as unknown as { host: { reactorClient: { get: unknown } } }
      ).host.reactorClient.get = get;

      // The default test sources refuse every connection.
      await service.onOperations([workflowOp(pinned("1.0.0"))]);
      expect(upsert).not.toHaveBeenCalled();
      expect(reason()).toContain("connectivity failure, not a missing piece");
      expect(reject.mock.calls[0]![4]).toBeInstanceOf(Date);

      sources = await startPieceSources({
        npm: [versionedPiece(PIECE, "1.0.0")],
      });
      await vi.advanceTimersByTimeAsync(30_000);
      // The retry fetches, extracts and describes the piece for real.
      await vi.waitFor(() => expect(upsert).toHaveBeenCalled(), {
        timeout: 15_000,
      });

      expect(armed()).toMatchObject({ version: "1.0.0", source: "npm" });
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

    await service.onOperations([workflowOp(UNPINNED)]);

    expect(upsert).not.toHaveBeenCalled();
    expect(reason()).toContain(
      `pins "latest", which is not an exact semver version`,
    );
    expect(sources.requests).toEqual([]);
  });

  it("drops the error it recorded once the workflow arms again", async () => {
    await service.onOperations([workflowOp(UNPINNED)]);
    expect(reject).toHaveBeenCalledTimes(1);

    packagePieces.setPieces([
      { name: PIECE, version: "2.0.0", bundleDir: inbox },
    ]);
    await service.onOperations([workflowOp(pinned("2.0.0"))]);

    // Queued ahead of the enable, so the row the arming writes is the one left.
    expect(remove).toHaveBeenCalledWith(WORKFLOW);
    expect(armed().version).toBe("2.0.0");
  });
});

describe("a trigger whose strategy is not known for sure", () => {
  it("is ERROR, not polled, when its descriptor cannot be read", async () => {
    packagePieces.setPieces([
      { name: PIECE, version: "2.0.0", bundleDir: join(dir, "missing") },
    ]);

    await service.onOperations([workflowOp(pinned("2.0.0"))]);

    expect(upsert).not.toHaveBeenCalled();
    expect(reason()).toContain("Could not describe");
    // A read failure may clear up; a retry is scheduled.
    expect(reject.mock.calls.at(-1)?.[4]).toBeInstanceOf(Date);
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

    await service.onOperations([workflowOp(pinned("3.0.0"))]);

    expect(upsert).not.toHaveBeenCalled();
    expect(reason()).toContain("APP_WEBHOOK");
    expect(reject.mock.calls.at(-1)?.[4]).toBeUndefined();
  });
});

describe("a trigger that was never a piece", () => {
  it("says nothing", async () => {
    await service.onOperations([
      workflowOp({
        pieceName: CORE_PIECE_NAME,
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "manual",
      }),
    ]);

    expect(upsert).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
