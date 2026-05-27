import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProcessorRecord } from "@powerhousedao/shared/processors";
import { buildDefaultProperties, loadEvents } from "./events.js";
import { createOpenPanelProcessorFactory } from "./factory.js";
import { OpenPanelProcessor } from "./processor.js";
import type { OpenPanelTracker } from "./processor.js";
import type { OpenPanelEventMapping } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal OperationWithContext for testing. */
function makeOp(
  documentType: string,
  actionType: string,
  overrides: { documentId?: string; scope?: string; branch?: string } = {},
) {
  return {
    operation: {
      id: "test-op-id",
      index: 0,
      skip: 0,
      timestampUtcMs: "1000",
      hash: "abc",
      action: {
        type: actionType,
        scope: overrides.scope ?? "global",
        input: {},
      },
    },
    context: {
      documentType,
      documentId: overrides.documentId ?? "doc-1",
      scope: overrides.scope ?? "global",
      branch: overrides.branch ?? "main",
      ordinal: 1,
    },
  };
}

/** Create a fresh fake client with vi.fn() spies. */
function makeFakeClient() {
  return {
    track: vi.fn().mockResolvedValue(undefined) as unknown as
      ((name: string, properties?: Record<string, unknown>) => unknown) & ReturnType<typeof vi.fn>,
    flush: vi.fn() as unknown as (() => void) & ReturnType<typeof vi.fn>,
  };
}

// Load the real bundled event mapping once for all tests.
const { lookupMap: realLookupMap } = loadEvents();

// ---------------------------------------------------------------------------
// Mapping selection
// ---------------------------------------------------------------------------

describe("OpenPanelProcessor — mapping selection", () => {
  let client: ReturnType<typeof makeFakeClient>;
  let processor: OpenPanelProcessor;

  beforeEach(() => {
    client = makeFakeClient();
    processor = new OpenPanelProcessor(client, realLookupMap);
  });

  it("calls track for a mapped (documentType, actionType)", async () => {
    const op = makeOp("powerhouse/document-drive", "ADD_FOLDER");
    await processor.onOperations([op as any]);
    expect(client.track).toHaveBeenCalledTimes(1);
  });

  it("calls track for every mapped op in the batch", async () => {
    const ops = [
      makeOp("powerhouse/document-drive", "ADD_FOLDER"),
      makeOp("powerhouse/document-drive", "ADD_FILE"),
      makeOp("powerhouse/document-model", "SET_MODEL_NAME"),
    ];
    await processor.onOperations(ops as any[]);
    expect(client.track).toHaveBeenCalledTimes(3);
  });

  it("does NOT call track for an unmapped actionType on a known documentType", async () => {
    // REMOVE_FOLDER was pruned from powerhouse/document-drive in events.json
    const op = makeOp("powerhouse/document-drive", "REMOVE_FOLDER");
    await processor.onOperations([op as any]);
    expect(client.track).not.toHaveBeenCalled();
  });

  it("does NOT call track for an entirely unknown documentType", async () => {
    const op = makeOp("unknown/document-type", "ADD_FOLDER");
    await processor.onOperations([op as any]);
    expect(client.track).not.toHaveBeenCalled();
  });

  it("skips unmapped ops while still tracking mapped ones in the same batch", async () => {
    const ops = [
      makeOp("powerhouse/document-drive", "REMOVE_FOLDER"), // unmapped
      makeOp("powerhouse/document-drive", "ADD_FILE"),      // mapped
    ];
    await processor.onOperations(ops as any[]);
    expect(client.track).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Default properties
// ---------------------------------------------------------------------------

describe("OpenPanelProcessor — default properties", () => {
  it("merges the six default properties into every tracked event", async () => {
    const client = makeFakeClient();
    const processor = new OpenPanelProcessor(client, realLookupMap);
    const op = makeOp("powerhouse/document-drive", "ADD_FOLDER", {
      documentId: "drive-42",
      scope: "global",
      branch: "main",
    });

    await processor.onOperations([op as any]);

    expect(client.track).toHaveBeenCalledWith(
      expect.any(String),
      buildDefaultProperties(op as any),
    );
  });

  it("payload includes app: 'connect' constant", async () => {
    const client = makeFakeClient();
    const processor = new OpenPanelProcessor(client, realLookupMap);
    const op = makeOp("powerhouse/document-drive", "ADD_FILE");

    await processor.onOperations([op as any]);

    const [, payload] = client.track.mock.calls[0];
    expect(payload).toMatchObject({ app: "connect" });
  });
});

// ---------------------------------------------------------------------------
// Alias override
// ---------------------------------------------------------------------------

describe("OpenPanelProcessor — alias override", () => {
  it("uses the alias as the event name when present", async () => {
    const aliasedMapping: OpenPanelEventMapping = {
      documentType: "test/doc",
      actionTypes: ["ACTION_A"],
      alias: "drive.folder.added",
    };
    const customLookupMap = new Map([
      ["test/doc", new Map([["ACTION_A", aliasedMapping]])],
    ]);

    const client = makeFakeClient();
    const processor = new OpenPanelProcessor(client, customLookupMap);
    const op = makeOp("test/doc", "ACTION_A");

    await processor.onOperations([op as any]);

    expect(client.track).toHaveBeenCalledWith("drive.folder.added", expect.any(Object));
  });

  it("uses the derived name when no alias is set", async () => {
    const client = makeFakeClient();
    const processor = new OpenPanelProcessor(client, realLookupMap);
    const op = makeOp("powerhouse/document-drive", "ADD_FOLDER");

    await processor.onOperations([op as any]);

    expect(client.track).toHaveBeenCalledWith(
      "powerhouse.document-drive.add_folder",
      expect.any(Object),
    );
  });
});

// ---------------------------------------------------------------------------
// SDK error handling
// ---------------------------------------------------------------------------

describe("OpenPanelProcessor — SDK error handling", () => {
  it("forwards a synchronous throw from track to onError and continues", async () => {
    const thrownError = new Error("sync sdk error");
    const client: OpenPanelTracker = {
      track: vi.fn().mockImplementation(() => {
        throw thrownError;
      }),
    };
    const onError = vi.fn();
    const processor = new OpenPanelProcessor(client, realLookupMap, onError);

    const ops = [
      makeOp("powerhouse/document-drive", "ADD_FOLDER"),
      makeOp("powerhouse/document-drive", "ADD_FILE"),
    ];

    await expect(processor.onOperations(ops as any[])).resolves.toBeUndefined();
    // onError called once per op that threw
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(thrownError, expect.objectContaining({ context: expect.any(Object) }));
  });

  it("forwards a rejected promise from track to onError and continues", async () => {
    const rejectedError = new Error("async sdk error");
    const client: OpenPanelTracker = {
      track: vi.fn().mockRejectedValue(rejectedError),
    };
    const onError = vi.fn();
    const processor = new OpenPanelProcessor(client, realLookupMap, onError);

    const ops = [
      makeOp("powerhouse/document-drive", "ADD_FOLDER"),
      makeOp("powerhouse/document-drive", "ADD_FILE"),
    ];

    await expect(processor.onOperations(ops as any[])).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(rejectedError, expect.any(Object));
  });

  it("continues processing remaining ops after an error", async () => {
    let callCount = 0;
    const client: OpenPanelTracker = {
      track: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw new Error("first op fails");
        return Promise.resolve();
      }),
    };
    const onError = vi.fn();
    const processor = new OpenPanelProcessor(client, realLookupMap, onError);

    const ops = [
      makeOp("powerhouse/document-drive", "ADD_FOLDER"),  // throws
      makeOp("powerhouse/document-drive", "ADD_FILE"),    // succeeds
    ];

    await processor.onOperations(ops as any[]);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(client.track).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// onDisconnect
// ---------------------------------------------------------------------------

describe("OpenPanelProcessor — onDisconnect", () => {
  it("calls flush() on the client", async () => {
    const client = makeFakeClient();
    const processor = new OpenPanelProcessor(client, realLookupMap);

    await processor.onDisconnect();

    expect(client.flush).toHaveBeenCalledTimes(1);
  });

  it("does not throw when client has no flush method", async () => {
    const client: OpenPanelTracker = { track: vi.fn() }; // no flush
    const processor = new OpenPanelProcessor(client, realLookupMap);

    await expect(processor.onDisconnect()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createOpenPanelProcessorFactory
// ---------------------------------------------------------------------------

describe("createOpenPanelProcessorFactory", () => {
  it("returns a single ProcessorRecord for each drive", () => {
    const client = makeFakeClient();
    const events = loadEvents();

    const factory = createOpenPanelProcessorFactory({ client, events });
    const records = factory({} as any);

    expect(records).toHaveLength(1);
  });

  it("filter.documentType is the union of all mapped document types", () => {
    const client = makeFakeClient();
    const events = loadEvents();
    const expectedDocTypes = Array.from(events.lookupMap.keys()).sort();

    const factory = createOpenPanelProcessorFactory({ client, events });
    const [record] = factory({} as any) as ProcessorRecord[];

    expect(record.filter.documentType?.slice().sort()).toEqual(expectedDocTypes);
  });

  it("startFrom defaults to 'current'", () => {
    const client = makeFakeClient();
    const events = loadEvents();

    const factory = createOpenPanelProcessorFactory({ client, events });
    const [record] = factory({} as any) as ProcessorRecord[];

    expect(record.startFrom).toBe("current");
  });

  it("startFrom can be overridden to 'beginning'", () => {
    const client = makeFakeClient();
    const events = loadEvents();

    const factory = createOpenPanelProcessorFactory({
      client,
      events,
      startFrom: "beginning",
    });
    const [record] = factory({} as any) as ProcessorRecord[];

    expect(record.startFrom).toBe("beginning");
  });

  it("returns an OpenPanelProcessor as the record's processor", () => {
    const client = makeFakeClient();
    const events = loadEvents();

    const factory = createOpenPanelProcessorFactory({ client, events });
    const [record] = factory({} as any) as ProcessorRecord[];

    expect(record.processor).toBeInstanceOf(OpenPanelProcessor);
  });

  it("threads the onError callback through to the processor", async () => {
    const thrownError = new Error("track error");
    const trackingClient: OpenPanelTracker = {
      track: vi.fn().mockImplementation(() => {
        throw thrownError;
      }),
    };
    const onError = vi.fn();
    const events = loadEvents();

    const factory = createOpenPanelProcessorFactory({
      client: trackingClient,
      events,
      onError,
    });
    const [record] = factory({} as any) as ProcessorRecord[];

    const op = makeOp("powerhouse/document-drive", "ADD_FOLDER");
    await record.processor.onOperations([op as any]);

    expect(onError).toHaveBeenCalledWith(thrownError, expect.any(Object));
  });
});
