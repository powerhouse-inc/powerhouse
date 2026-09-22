// A trigger block type naming a piece the reactor does not hold, with no
// version pinned, used to register nothing and say nothing about it.

// No registry entry, no trigger state, no log, and a webhook endpoint
// answering armed: false with nowhere to find the cause.
import type { OperationWithContext } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PieceCatalog from "./piece-catalog.js";

// The catalog is remote. Offline is the default here; a test that wants a
// version out of it says so.
vi.mock("./piece-catalog.js", async (importOriginal) => {
  const actual = await importOriginal<typeof PieceCatalog>();
  return {
    ...actual,
    fetchPieceCatalog: vi.fn(() => Promise.reject(new Error("offline"))),
    fetchPieceDetail: vi.fn(() => Promise.reject(new Error("offline"))),
  };
});

import { testRuntime } from "../../test/helpers/runtime.js";
import { fetchPieceCatalog, fetchPieceDetail } from "./piece-catalog.js";
import { packagePieces } from "./piece-registry.js";
import type { WorkflowRuntimeService } from "./service.js";
import type { PieceTriggerBinding } from "./trigger-supervisor.js";

const PIECE = "@powerhousedao/piece-paperless-ngx";
const UNVERSIONED = `${PIECE}#trigger:new_document`;
const PINNED = `${PIECE}@0.1.0#trigger:new_document`;
const WORKFLOW = "wf-paperless";

// Unique per operation: the service dedupes on the ordinal.
let ordinal = 0;

const enabledState = (blockType: string) => ({
  name: "Paperless",
  status: "ENABLED",
  version: 1,
  trigger: { id: "t1", blockType, config: {} },
  steps: [],
  edges: [],
  variables: [],
});

function workflowOp(blockType: string): OperationWithContext {
  ordinal += 1;
  return {
    operation: {
      index: ordinal,
      timestampUtcMs: `${ordinal}`,
      action: { type: "SET_TRIGGER", input: {} },
      resultingState: JSON.stringify(enabledState(blockType)),
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

// Arming does I/O the moment the supervisor is handed a binding. What this
// suite is about is which binding it is handed, and whether it is handed one.
const upsert = vi.fn((_binding: PieceTriggerBinding) => Promise.resolve());
const reject = vi.fn(
  (
    _workflowId: string,
    _blockType: string,
    _config: unknown,
    _message: string,
    _retryAt?: Date,
  ) => Promise.resolve(),
);
const remove = vi.fn((_workflowId: string) => Promise.resolve());

let service: WorkflowRuntimeService;

const armed = (): PieceTriggerBinding => upsert.mock.calls[0]![0];

// The call whose message carries the token, so a suite reads the values it
// was logged with rather than the position it was logged at.
const logCall = (calls: unknown[][], token: string) =>
  calls.find((call) => String(call[0]).includes(token));

beforeEach(() => {
  vi.clearAllMocks();
  // A source answering, with no such piece: clearing a mock keeps whatever the
  // last test taught it. An unreachable catalog is its own case, below.
  vi.mocked(fetchPieceCatalog).mockResolvedValue([]);
  vi.mocked(fetchPieceDetail).mockResolvedValue({});
  packagePieces.reset();
  service = testRuntime({ logger } as never);
  (service as unknown as { triggerSupervisor: unknown }).triggerSupervisor = {
    upsert,
    reject,
    remove,
    stop: vi.fn(),
  };
  // Poll-vs-webhook comes from the piece's own metadata: not what is under
  // test, and it would otherwise load a bundle or reach the network.
  vi.spyOn(service, "pieceTriggers").mockResolvedValue({
    name: PIECE,
    displayName: "Paperless",
    version: "0.1.0",
    auth: null,
    triggers: [
      {
        name: "new_document",
        displayName: "New Document",
        description: "",
        strategy: "POLLING",
        blockType: UNVERSIONED,
      },
    ],
  });
});

afterEach(() => {
  packagePieces.reset();
  service.shutdown();
});

describe("a trigger block type with no version", () => {
  it("runs the installed copy when the reactor holds the piece", async () => {
    packagePieces.setPieces([
      { name: PIECE, version: "2.0.0", bundleDir: "/pkg/paperless" },
    ]);

    await service.onOperations([workflowOp(UNVERSIONED)]);

    expect(armed().version).toBe("2.0.0");
    expect(armed().triggerName).toBe("new_document");
    // Nothing is asked of the catalog, so an installed piece cannot be pulled
    // out from under a workflow by somebody else's publish.
    expect(fetchPieceDetail).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
  });

  it("falls back to the version the piece catalog serves, and names it", async () => {
    vi.mocked(fetchPieceDetail).mockResolvedValue({ version: "0.1.0" });

    await service.onOperations([workflowOp(UNVERSIONED)]);

    expect(fetchPieceDetail).toHaveBeenCalledWith(PIECE);
    expect(armed().version).toBe("0.1.0");
    expect(logger.warn).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
    // The version is logged because it is the one part of this binding the
    // workflow does not pin: the next publish moves it.
    const logged = logCall(logger.info.mock.calls, "@version");
    expect(logged?.slice(1)).toEqual([
      UNVERSIONED,
      `workflow ${WORKFLOW}`,
      "0.1.0",
    ]);
    // Scoped names travel as logger values; inline they print as null/pack.
    expect(String(logged?.[0])).not.toContain(PIECE);
  });

  it("reports a piece nothing can resolve instead of dropping it", async () => {
    await service.onOperations([workflowOp(UNVERSIONED)]);

    expect(upsert).not.toHaveBeenCalled();
    const warned = logCall(logger.warn.mock.calls, "@reason");
    expect(warned?.[1]).toBe(WORKFLOW);
    expect(String(warned?.[2])).toContain(UNVERSIONED);
    expect(String(warned?.[2])).toMatch(/pin a version/i);
    expect(String(warned?.[0])).not.toContain(PIECE);
    // And where every other trigger failure is read from. No retry time: an
    // absent piece changes nothing on its own.
    expect(reject).toHaveBeenCalledWith(
      WORKFLOW,
      UNVERSIONED,
      {},
      expect.stringContaining(UNVERSIONED),
      undefined,
    );
  });

  it("says the catalog was unreachable rather than that the piece is gone", async () => {
    vi.mocked(fetchPieceCatalog).mockRejectedValue(new Error("offline"));
    vi.mocked(fetchPieceDetail).mockRejectedValue(new Error("ECONNREFUSED"));

    await service.onOperations([workflowOp(UNVERSIONED)]);

    const warned = logCall(logger.warn.mock.calls, "@reason");
    const reason = String(warned?.[2]);
    // The old message asserted the catalog has no such piece and told the
    // operator to install one. Neither is known here, and neither is the fix.
    expect(reason).toContain("could not be reached");
    expect(reason).toContain("connectivity failure, not a missing piece");
    expect(reason).not.toMatch(/has none either/);
    // Recorded with a time it will be tried again, not parked forever.
    const [, , , , retryAt] = reject.mock.calls[0]!;
    expect(retryAt).toBeInstanceOf(Date);
  });

  it("comes back for a trigger the catalog could not answer for", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetchPieceCatalog).mockRejectedValue(new Error("offline"));
      vi.mocked(fetchPieceDetail).mockRejectedValue(new Error("offline"));
      const get = vi.fn(() =>
        Promise.resolve({
          header: { id: WORKFLOW, documentType: "powerhouse/workflow" },
          state: { global: enabledState(UNVERSIONED) },
        }),
      );
      (
        service as unknown as { host: { reactorClient: { get: unknown } } }
      ).host.reactorClient.get = get;

      await service.onOperations([workflowOp(UNVERSIONED)]);
      expect(upsert).not.toHaveBeenCalled();

      // The outage ends, and nothing else would ever come back to this row.
      vi.mocked(fetchPieceDetail).mockResolvedValue({ version: "0.1.0" });
      await vi.advanceTimersByTimeAsync(30_000);
      await vi.waitFor(() => expect(upsert).toHaveBeenCalled());

      expect(armed().version).toBe("0.1.0");
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops the error it recorded once the workflow registers again", async () => {
    await service.onOperations([workflowOp(UNVERSIONED)]);
    expect(reject).toHaveBeenCalledTimes(1);

    packagePieces.setPieces([
      { name: PIECE, version: "2.0.0", bundleDir: "/pkg/paperless" },
    ]);
    await service.onOperations([workflowOp(UNVERSIONED)]);

    // Queued ahead of the enable, so the row the arming writes is the one left.
    expect(remove).toHaveBeenCalledWith(WORKFLOW);
    expect(armed().version).toBe("2.0.0");
  });
});

describe("the block types this path must leave alone", () => {
  it("keeps a pinned version exactly as the workflow wrote it", async () => {
    await service.onOperations([workflowOp(PINNED)]);

    expect(armed().version).toBe("0.1.0");
    expect(fetchPieceDetail).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
  });

  it("says nothing about a trigger that was never a piece", async () => {
    await service.onOperations([workflowOp("core#manual")]);

    expect(upsert).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    // core is the engine's own namespace; no catalog has heard of it.
    expect(fetchPieceDetail).not.toHaveBeenCalled();
  });
});
