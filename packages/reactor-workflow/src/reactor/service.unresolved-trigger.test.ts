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
    fetchPieceVersion: vi.fn(() => Promise.reject(new Error("offline"))),
  };
});

import { testRuntime } from "../../test/helpers/runtime.js";
import { fetchPieceVersion } from "./piece-catalog.js";
import { packagePieces } from "./piece-registry.js";
import type { WorkflowRuntimeService } from "./service.js";
import type { PieceTriggerBinding } from "./trigger-supervisor.js";

const PIECE = "@powerhousedao/piece-paperless-ngx";
const UNVERSIONED = `${PIECE}#trigger:new_document`;
const PINNED = `${PIECE}@0.1.0#trigger:new_document`;
const WORKFLOW = "wf-paperless";

// Unique per operation: the service dedupes on the ordinal.
let ordinal = 0;

function workflowOp(blockType: string): OperationWithContext {
  ordinal += 1;
  return {
    operation: {
      index: ordinal,
      timestampUtcMs: `${ordinal}`,
      action: { type: "SET_TRIGGER", input: {} },
      resultingState: JSON.stringify({
        name: "Paperless",
        status: "ENABLED",
        version: 1,
        trigger: { id: "t1", blockType, config: {} },
        steps: [],
        edges: [],
        variables: [],
      }),
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
  // Offline again: clearing a mock keeps whatever the last test taught it.
  vi.mocked(fetchPieceVersion).mockRejectedValue(new Error("offline"));
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
    expect(fetchPieceVersion).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
  });

  it("falls back to the version the piece catalog serves, and names it", async () => {
    vi.mocked(fetchPieceVersion).mockResolvedValue("0.1.0");

    await service.onOperations([workflowOp(UNVERSIONED)]);

    expect(fetchPieceVersion).toHaveBeenCalledWith(PIECE);
    expect(armed().version).toBe("0.1.0");
    expect(reject).not.toHaveBeenCalled();
    // The version is logged because it is the one part of this binding the
    // workflow does not pin: the next publish moves it.
    const logged = logCall(logger.info.mock.calls, "@version");
    expect(logged?.slice(1)).toEqual([WORKFLOW, UNVERSIONED, "0.1.0"]);
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
    // And where every other trigger failure is read from.
    expect(reject).toHaveBeenCalledWith(
      WORKFLOW,
      UNVERSIONED,
      {},
      expect.stringContaining(UNVERSIONED),
    );
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
    expect(fetchPieceVersion).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
  });

  it("says nothing about a trigger that was never a piece", async () => {
    await service.onOperations([workflowOp("core#manual")]);

    expect(upsert).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
