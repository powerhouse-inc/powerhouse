import type {
  KeyframeCleanupRun,
  KeyframeReclaim,
} from "@powerhousedao/reactor";
import { KEYFRAME_ADMIN_OPERATIONS } from "@powerhousedao/reactor";
import { describe, expect, it, vi } from "vitest";
import {
  executeKeyframesAction,
  formatBytes,
  keyframesEndpoint,
  keyframesRequest,
  runReport,
  type KeyframesCommandArgs,
  type KeyframesRequest,
} from "../src/services/keyframes.js";

function runOf(
  overrides: Partial<KeyframeCleanupRun> = {},
): KeyframeCleanupRun {
  return {
    id: "run-1",
    dryRun: true,
    state: "done",
    startedAtUtcMs: 1,
    finishedAtUtcMs: 2,
    documentsTotal: 2,
    documentsSeen: 2,
    parked: false,
    totals: {
      streams: 2,
      rows: 10,
      bytes: 2048,
      removableRows: 6,
      removableBytes: 1024,
      removedRows: 0,
      removedBytes: 0,
    },
    types: [
      {
        documentType: "a/b",
        keep: 2,
        interval: 10,
        streams: 2,
        rows: 10,
        bytes: 2048,
        removableRows: 6,
        removableBytes: 1024,
        removedRows: 0,
        removedBytes: 0,
      },
    ],
    reasons: [{ reason: "beyond-keep", rows: 6, bytes: 1024 }],
    topStreams: [
      {
        documentId: "doc-1",
        documentType: "a/b",
        scope: "global",
        branch: "main",
        reason: "beyond-keep",
        rows: 5,
        bytes: 1024,
        removableRows: 3,
        removableBytes: 512,
      },
    ],
    error: null,
    ...overrides,
  };
}

const RECLAIMED: KeyframeReclaim = {
  state: "done",
  startedAtUtcMs: 1,
  finishedAtUtcMs: 2,
  tableBytesBefore: 3 * 1024 ** 3,
  tableBytesAfter: 1024 ** 2,
  durationMs: 5,
  message: "The Keyframe table was rewritten.",
};

function harness(answers: Record<string, unknown[]>) {
  const out: string[] = [];
  const err: string[] = [];
  const request = vi.fn((query: string) => {
    const entry = Object.entries(KEYFRAME_ADMIN_OPERATIONS).find(
      ([, document]) => document === query,
    );
    const queue = answers[entry?.[0] ?? ""];
    if (!queue || queue.length === 0) {
      throw new Error(`unexpected request ${entry?.[0] ?? query}`);
    }
    return Promise.resolve(queue.shift());
  }) as unknown as KeyframesRequest;
  const deps = {
    request,
    output: {
      out: (line: string) => out.push(line),
      err: (line: string) => err.push(line),
    },
    pollIntervalMs: 0,
  };
  const run = (args: Partial<KeyframesCommandArgs>) =>
    executeKeyframesAction(
      { action: "preview", ...args } as KeyframesCommandArgs,
      deps,
    );
  return { out, err, request, run };
}

describe("keyframesEndpoint", () => {
  it("mounts beside /graphql, whatever the trailing slash", () => {
    expect(keyframesEndpoint("http://localhost:4001/graphql")).toBe(
      "http://localhost:4001/graphql/inspection-admin",
    );
    expect(keyframesEndpoint("http://localhost:4001/graphql/")).toBe(
      "http://localhost:4001/graphql/inspection-admin",
    );
    expect(
      keyframesEndpoint("http://localhost:4001/graphql/inspection-admin"),
    ).toBe("http://localhost:4001/graphql/inspection-admin");
  });
});

describe("formatBytes", () => {
  it.each([
    [512, "512 B"],
    [2048, "2.0 KB"],
    [5 * 1024 ** 2, "5.0 MB"],
    [3 * 1024 ** 3, "3.00 GB"],
  ])("%d is %s", (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});

describe("runReport", () => {
  it("states a preview by type, reason and stream", () => {
    const lines = runReport(runOf()).join("\n");

    expect(lines).toContain("Preview: done, 2 of 2 documents");
    expect(lines).toContain("Would remove: 6 (1.0 KB)");
    expect(lines).not.toContain("Removed:");
    expect(lines).toContain("beyond-keep: 6 (1.0 KB)");
    expect(lines).toContain("a/b (interval 10, keep 2)");
    expect(lines).toContain("doc-1 global/main");
  });

  it("states what a real run removed", () => {
    const lines = runReport(
      runOf({
        dryRun: false,
        totals: { ...runOf().totals, removedRows: 6, removedBytes: 1024 },
      }),
    ).join("\n");

    expect(lines).toContain("Removed: 6 (1.0 KB)");
  });
});

describe("executeKeyframesAction", () => {
  it("previews with a dry run and follows it to the end", async () => {
    const { run, request, out, err } = harness({
      startCleanup: [
        {
          inspectionStartKeyframeCleanup: runOf({
            state: "running",
            documentsSeen: 0,
          }),
        },
      ],
      cleanup: [{ inspectionKeyframeCleanup: runOf() }],
    });

    await expect(run({ action: "preview" })).resolves.toBe(0);

    expect(request).toHaveBeenCalledWith(
      KEYFRAME_ADMIN_OPERATIONS.startCleanup,
      { dryRun: true },
    );
    expect(err).toEqual(["0 of 2 documents, 0 removed"]);
    expect(out.join("\n")).toContain("Would remove: 6");
  });

  it("refuses a clean without --yes and sends nothing", async () => {
    const { run, request, err } = harness({});

    await expect(run({ action: "clean" })).resolves.toBe(1);

    expect(request).not.toHaveBeenCalled();
    expect(err.join("\n")).toContain("--yes");
  });

  it("cleans with --yes", async () => {
    const { run, request } = harness({
      startCleanup: [
        { inspectionStartKeyframeCleanup: runOf({ dryRun: false }) },
      ],
    });

    await expect(run({ action: "clean", yes: true })).resolves.toBe(0);

    expect(request).toHaveBeenCalledWith(
      KEYFRAME_ADMIN_OPERATIONS.startCleanup,
      { dryRun: false },
    );
  });

  it("exits 1 on a run that did not finish", async () => {
    const { run, out } = harness({
      startCleanup: [
        {
          inspectionStartKeyframeCleanup: runOf({
            state: "failed",
            error: "store gone",
          }),
        },
      ],
    });

    await expect(run({ action: "preview" })).resolves.toBe(1);

    expect(out.join("\n")).toContain("Error: store gone");
  });

  it("prints JSON with --json", async () => {
    const report = runOf();
    const { run, out } = harness({
      startCleanup: [{ inspectionStartKeyframeCleanup: report }],
    });

    await run({ action: "preview", json: true });

    expect(JSON.parse(out.join("\n"))).toEqual(report);
  });

  it("states the latest run and reclaim", async () => {
    const { run, out } = harness({
      cleanup: [{ inspectionKeyframeCleanup: null }],
      reclaimStatus: [{ inspectionKeyframeReclaim: RECLAIMED }],
    });

    await expect(run({ action: "status" })).resolves.toBe(0);

    const text = out.join("\n");
    expect(text).toContain("No clean-up has run");
    expect(text).toContain("Keyframe table: 3.00 GB to 1.0 MB");
  });

  it("cancels", async () => {
    const { run, request } = harness({
      cancelCleanup: [{ inspectionCancelKeyframeCleanup: true }],
    });

    await expect(run({ action: "cancel" })).resolves.toBe(0);

    expect(request).toHaveBeenCalledWith(
      KEYFRAME_ADMIN_OPERATIONS.cancelCleanup,
    );
  });

  it("reclaims with --yes and follows it", async () => {
    const running = { ...RECLAIMED, state: "running", tableBytesAfter: null };
    const { run, out } = harness({
      reclaim: [{ inspectionReclaimKeyframeSpace: running }],
      reclaimStatus: [{ inspectionKeyframeReclaim: RECLAIMED }],
    });

    await expect(run({ action: "reclaim", yes: true })).resolves.toBe(0);

    expect(out.join("\n")).toContain("Reclaim: done");
  });

  it("exits 0 on a host that only says what to do by hand", async () => {
    const { run, out } = harness({
      reclaim: [
        {
          inspectionReclaimKeyframeSpace: {
            ...RECLAIMED,
            state: "unsupported",
            message: "use pg_repack",
          },
        },
      ],
    });

    await expect(run({ action: "reclaim", yes: true })).resolves.toBe(0);

    expect(out.join("\n")).toContain("use pg_repack");
  });

  it("refuses a reclaim without --yes", async () => {
    const { run, request } = harness({});

    await expect(run({ action: "reclaim" })).resolves.toBe(1);

    expect(request).not.toHaveBeenCalled();
  });

  it("exits 1 on a busy store", async () => {
    const { run } = harness({
      reclaim: [
        {
          inspectionReclaimKeyframeSpace: {
            ...RECLAIMED,
            state: "busy",
            message: "Try again in a quieter moment.",
          },
        },
      ],
    });

    await expect(run({ action: "reclaim", yes: true })).resolves.toBe(1);
  });
});

describe("keyframesRequest", () => {
  const ok = (body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

  it("posts the query with the bearer", async () => {
    const fetchImpl = vi.fn(() => ok({ data: { a: 1 } }));
    const request = keyframesRequest(
      "http://host/graphql/inspection-admin",
      "token",
      fetchImpl as unknown as typeof fetch,
    );

    await expect(request("query { a }", { b: 2 })).resolves.toEqual({ a: 1 });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://host/graphql/inspection-admin",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer token",
        }) as unknown,
        body: JSON.stringify({ query: "query { a }", variables: { b: 2 } }),
      }),
    );
  });

  it("says who may call on a refusal", async () => {
    const request = keyframesRequest("http://host", undefined, (() =>
      ok({
        errors: [{ message: "No", extensions: { code: "FORBIDDEN" } }],
      })) as unknown as typeof fetch);

    await expect(request("query { a }")).rejects.toThrow(
      "must be one of the host's auth admins",
    );
  });

  it("points at the switch on an answer that is not GraphQL", async () => {
    const request = keyframesRequest("http://host", undefined, (() =>
      Promise.resolve(
        new Response("Not Found", { status: 404 }),
      )) as unknown as typeof fetch);

    await expect(request("query { a }")).rejects.toThrow(
      "INSPECTION_ADMIN_ENABLED",
    );
  });
});
