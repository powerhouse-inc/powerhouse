// A block type that pins no version and names a piece this reactor does not
// hold resolves the same way for every caller that asks.

// It used to resolve for none of them, and then for the trigger binding alone,
// which left a workflow armed on a piece its own editor could not describe.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PieceCatalog from "./piece-catalog.js";
import type * as Pieces from "../pieces/index.js";

// Both remotes are refused here: the bundle fetch records what it was asked
// for, which is how a test reads the version resolution landed on.
const bundleRequests: { name: string; version: string }[] = [];

vi.mock("../pieces/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof Pieces>();
  return {
    ...actual,
    ensurePieceBundle: vi.fn((request: { name: string; version: string }) => {
      bundleRequests.push({ name: request.name, version: request.version });
      return Promise.reject(new Error("bundle fetch refused in this suite"));
    }),
  };
});

vi.mock("./piece-catalog.js", async (importOriginal) => {
  const actual = await importOriginal<typeof PieceCatalog>();
  return {
    ...actual,
    fetchPieceCatalog: vi.fn(() => Promise.reject(new Error("offline"))),
    fetchPieceDetail: vi.fn(() => Promise.reject(new Error("offline"))),
  };
});

import { testRuntime } from "../../test/helpers/runtime.js";
import type { PieceDescriptor } from "../pieces/index.js";
import { fetchPieceCatalog, fetchPieceDetail } from "./piece-catalog.js";
import { packagePieces } from "./piece-registry.js";
import type { WorkflowRuntimeService } from "./service.js";

const PIECE = "@powerhousedao/piece-paperless-ngx";
const ACTION = `${PIECE}#upload_document`;
const TRIGGER = `${PIECE}#trigger:new_document`;
const VERSION = "0.1.0";

// What the catalog serves for the piece, in the shape blockOutputTree reads.
const detail = {
  name: PIECE,
  displayName: "Paperless",
  version: VERSION,
  actions: {
    upload_document: { sampleData: { id: 7, title: "Scan" } },
  },
  triggers: { new_document: {} },
};

const descriptor = {
  name: PIECE,
  version: VERSION,
  displayName: "Paperless",
  logoUrl: "",
  description: "",
  categories: [],
  auth: null,
  actions: [{ name: "upload_document", displayName: "Upload Document" }],
  triggers: [{ name: "new_document", displayName: "New Document" }],
} as unknown as PieceDescriptor;

let service: WorkflowRuntimeService;

// The service's own descriptor cache, keyed by the package and version it
// resolved: seeding it proves which version the lookup arrived at.
const seedDescriptor = (version: string) =>
  (
    service as unknown as { descriptors: Map<string, PieceDescriptor> }
  ).descriptors.set(`${PIECE}@${version}`, descriptor);

// A source answered and has no such piece. Distinct from an unreachable
// catalog, which is not an answer and is never remembered as one.
const absent = () => {
  vi.mocked(fetchPieceCatalog).mockResolvedValue([]);
  vi.mocked(fetchPieceDetail).mockResolvedValue({});
};

const unreachable = () => {
  vi.mocked(fetchPieceCatalog).mockRejectedValue(new Error("offline"));
  vi.mocked(fetchPieceDetail).mockRejectedValue(new Error("offline"));
};

beforeEach(() => {
  vi.clearAllMocks();
  bundleRequests.length = 0;
  absent();
  packagePieces.reset();
  service = testRuntime();
});

afterEach(() => {
  packagePieces.reset();
  service.shutdown();
});

// The catalog knows the piece; nothing local does.
const published = () => {
  vi.mocked(fetchPieceDetail).mockResolvedValue(detail);
};

describe("a design-time read of an unpinned block type", () => {
  it("describes a block the catalog knows and the reactor does not", async () => {
    published();
    seedDescriptor(VERSION);

    const answer = (await service.blockDescriptor(ACTION)) as {
      displayName: string;
      action: { name: string };
    } | null;

    // Before, this was null and the editor drew a form with no fields in it.
    expect(answer?.displayName).toBe("Paperless");
    expect(answer?.action.name).toBe("upload_document");
  });

  it("describes a trigger of that piece too", async () => {
    published();
    seedDescriptor(VERSION);

    const answer = (await service.blockDescriptor(TRIGGER)) as {
      trigger: { name: string };
    } | null;

    expect(answer?.trigger.name).toBe("new_document");
  });

  it("carries the resolved version into a block's options lookup", async () => {
    published();

    // The bundle is refused here, so the reject is the piece being fetched at
    // all -- which it never was while the block type resolved to nothing.
    await expect(service.blockOptions(ACTION, "folder")).rejects.toThrow(
      /bundle fetch refused/,
    );
    expect(bundleRequests).toEqual([{ name: PIECE, version: VERSION }]);
  });

  it("still refuses a block type that is not a piece at all", async () => {
    await expect(service.blockOptions("nonsense", "folder")).rejects.toThrow(
      /Not a piece block type/,
    );
  });

  it("builds an output tree from the piece the catalog serves", async () => {
    published();

    const tree = (await service.blockOutputTree(ACTION)) as {
      source: string;
      nodes: { name: string }[];
    };

    // Before: { source: "none", nodes: [] }, because nothing resolved the name.
    expect(tree.source).toBe("sample");
    expect(tree.nodes.map((node) => node.name)).toEqual(["id", "title"]);
  });

  it("answers as it always did when no source knows the piece", async () => {
    expect(await service.blockDescriptor(ACTION)).toBeNull();
    expect(await service.blockOutputTree(ACTION)).toEqual({
      source: "none",
      nodes: [],
    });
    await expect(service.blockOptions(ACTION, "folder")).rejects.toThrow(
      /Not a piece block type/,
    );
  });
});

describe("what the shared resolution refuses to pay for", () => {
  it("never asks the catalog about the engine's own blocks", async () => {
    expect(await service.blockDescriptor("core#manual")).toBeNull();
    expect(await service.blockOutputTree("core#branch")).toEqual({
      source: "static",
      nodes: [{ name: "condition", type: "value" }],
    });

    expect(fetchPieceDetail).not.toHaveBeenCalled();
    expect(fetchPieceCatalog).not.toHaveBeenCalled();
  });

  it("asks once for a name no source answers for", async () => {
    // Three reads of the same unresolvable block type, as an editor would make
    // them. Without the miss being remembered, each pays both fetches again.
    await service.blockDescriptor(ACTION);
    await service.blockOutputTree(ACTION);
    await service.blockDescriptor(TRIGGER);

    expect(vi.mocked(fetchPieceDetail).mock.calls).toHaveLength(1);
    expect(vi.mocked(fetchPieceCatalog).mock.calls).toHaveLength(1);
  });

  it("does not remember a catalog that never answered", async () => {
    unreachable();

    // Three reads, and every one of them asks again: an outage is not an
    // answer, and caching it would hold the name unresolvable after it ends.
    await service.blockDescriptor(ACTION);
    await service.blockDescriptor(ACTION);
    await service.blockDescriptor(ACTION);

    expect(
      vi.mocked(fetchPieceDetail).mock.calls.length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("shares one lookup between callers that race for it", async () => {
    const answers = await Promise.all([
      service.blockDescriptor(ACTION),
      service.blockDescriptor(TRIGGER),
      service.blockOutputTree(ACTION),
    ]);

    expect(answers[0]).toBeNull();
    expect(vi.mocked(fetchPieceDetail).mock.calls).toHaveLength(1);
  });

  it("gives up on a catalog that never answers, rather than hanging", async () => {
    vi.useFakeTimers();
    try {
      // Neither source ever settles: the editor call must still return, and
      // the timeout has to read as an outage, not as a piece that is absent.
      vi.mocked(fetchPieceCatalog).mockReturnValue(
        new Promise(() => undefined),
      );
      vi.mocked(fetchPieceDetail).mockReturnValue(new Promise(() => undefined));

      const pending = service.blockDescriptor(ACTION);
      await vi.advanceTimersByTimeAsync(2_000);

      expect(await pending).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("prefers the installed piece and asks nothing of the catalog", async () => {
    packagePieces.setPieces([
      { name: PIECE, version: "2.0.0", bundleDir: "/pkg/paperless" },
    ]);
    seedDescriptor("2.0.0");

    expect(await service.blockDescriptor(ACTION)).not.toBeNull();
    expect(fetchPieceDetail).not.toHaveBeenCalled();
    expect(fetchPieceCatalog).not.toHaveBeenCalled();
  });
});
