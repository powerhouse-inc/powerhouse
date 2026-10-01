// Block resolution end to end: real runs through the piece worker against
// an installed piece, a registry, npm and the Activepieces CDN, all local.
import { actions } from "@powerhousedao/workflow/document-models/workflow";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OperationWithContext } from "document-model";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Documents } from "../../test/helpers/documents.js";
import {
  startPieceSources,
  versionedPiece,
  type FixturePiece,
  type PieceSources,
} from "../../test/helpers/piece-sources.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { packagePieces } from "./piece-registry.js";
import type { WorkflowRuntimeService } from "./service.js";
import { configHash } from "./trigger-supervisor.js";
import type { BlockRef } from "@powerhousedao/pieces-framework/block-type";
import { CORE_PIECE_NAME, CORE_PIECE_VERSION } from "../pieces/index.js";

const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;

const LOCAL = "@acme/piece-local";
const SERVED = "@acme/piece-served";
const REGISTRY = "@acme/piece-registry";
const OWNED = "@acme/piece-owned";
const NPM_ONLY = "@acme/piece-npm-only";
const AP = "@activepieces/piece-fixture";
const HOST_BOUND = "@powerhousedao/piece-reactor";
const HTTP = "@activepieces/piece-http-fixture";
const MANY = "@acme/piece-many";

let dir = "";
let sources: PieceSources;
let documents: Documents;
let service: WorkflowRuntimeService;

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

function action(pieceName: string, pieceVersion: string, name: string) {
  return { pieceName, pieceVersion, kind: "action" as const, name };
}

// One manual workflow per block, so each run reads one resolution.
let workflows = 0;
function workflowRunning(block: BlockRef): string {
  const id = `wf-${++workflows}`;
  documents.apply(
    id,
    actions.setTrigger({
      id: "t1",
      pieceName: "@powerhousedao/piece-core",
      pieceVersion: CORE_PIECE_VERSION,
      triggerName: "manual",
      config: {},
    }),
    actions.addStep({
      id: "s1",
      key: "step",
      name: "Step",
      pieceName: block.pieceName,
      pieceVersion: block.pieceVersion,
      actionName: block.name,
      config: {},
    }),
    actions.addEdge({ id: "e1", from: "t1", to: "s1", port: "next" }),
    actions.publishWorkflow({ publishedAt: "2026-01-01T00:00:00.000Z" }),
    actions.setWorkflowStatus({ status: "ENABLED" }),
  );
  return id;
}

async function run(pieceName: string, pieceVersion: string, name: string) {
  const id = workflowRunning(action(pieceName, pieceVersion, name));
  const result = await service.fire(id, undefined, "manual", undefined, CTX);
  const store = (await service.store())!;
  return {
    result,
    run: (await store.getRun(result.runId!))!,
    row: (await store.getSteps(result.runId!))[0],
  };
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "rw-resolution-"));
  const served = versionedPiece(SERVED, "3.0.0");
  sources = await startPieceSources({
    registry: [
      versionedPiece(REGISTRY, "1.0.0"),
      versionedPiece(REGISTRY, "1.2.0"),
      versionedPiece(REGISTRY, "2.1.0"),
      versionedPiece(OWNED, "1.0.0"),
      versionedPiece(HOST_BOUND, "9.9.9"),
    ],
    npm: [
      versionedPiece(OWNED, "2.0.0"),
      versionedPiece(NPM_ONLY, "0.3.0"),
      versionedPiece(AP, "0.5.1"),
      // Only the newest release has send_request.
      versionedPiece(HTTP, "0.0.1"),
      versionedPiece(HTTP, "0.0.2"),
      versionedPiece(HTTP, "0.1.0", { action: "send_request" }),
      ...["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.5.0"].map((v) =>
        versionedPiece(MANY, v),
      ),
    ],
    files: {
      "/pkg/served/package.json": JSON.stringify({
        name: SERVED,
        version: "3.0.0",
        main: "index.js",
      }),
      "/pkg/served/index.js": served.code,
    },
  });
  packagePieces.setPieces([
    {
      name: LOCAL,
      version: "1.0.0",
      bundleDir: await bundleDir(versionedPiece(LOCAL, "1.0.0")),
    },
    // Also published at 1.2.0: the installed copy still wins its own version.
    {
      name: REGISTRY,
      version: "1.2.0",
      bundleDir: await bundleDir({
        ...versionedPiece(REGISTRY, "1.2.0"),
        code: versionedPiece(REGISTRY, "1.2.0-local").code,
      }),
    },
    {
      name: HOST_BOUND,
      version: "1.0.0",
      bundleDir: await bundleDir(versionedPiece(HOST_BOUND, "1.0.0")),
    },
    // A package loaded from a registry: declared, served at its entryUrl.
    {
      name: SERVED,
      version: "3.0.0",
      entryUrl: `${sources.url}/pkg/served/index.js`,
    },
  ]);
  documents = new Documents();
  service = testRuntime({ reactorClient: documents.client() as never });
});

afterAll(async () => {
  service.shutdown();
  packagePieces.reset();
  await sources.stop();
  await rm(dir, { recursive: true, force: true });
});

describe("exact versions", () => {
  it("runs the installed piece, and journals where it came from", async () => {
    const { result, row, run: journal } = await run(LOCAL, "1.0.0", "report");

    expect(result.steps[0].output).toEqual({ version: "1.0.0" });
    expect(row).toMatchObject({
      piece_version: "1.0.0",
      piece_source: "local",
      version_match: "exact",
      version_note: null,
    });
    expect(journal.warnings).toBe(0);
  });

  it("prefers the installed copy over a registry holding the same version", async () => {
    const { result, row } = await run(REGISTRY, "1.2.0", "report");

    expect(result.steps[0].output).toEqual({ version: "1.2.0-local" });
    expect(row.piece_source).toBe("local");
  });

  it("fetches a version only the registry has, from the registry", async () => {
    const { result, row } = await run(REGISTRY, "2.1.0", "report");

    expect(result.steps[0].output).toEqual({ version: "2.1.0" });
    expect(row).toMatchObject({
      piece_version: "2.1.0",
      piece_source: "registry",
      version_match: "exact",
    });
    expect(sources.requests).toContain(
      `/registry/-/pieces/bundled/${REGISTRY}/2.1.0.tgz`,
    );
  });

  it("reads npm for a name the registry does not have", async () => {
    const { result, row } = await run(NPM_ONLY, "0.3.0", "report");

    expect(result.steps[0].output).toEqual({ version: "0.3.0" });
    expect(row.piece_source).toBe("npm");
  });

  it("reads an Activepieces piece from their CDN", async () => {
    const { result, row } = await run(AP, "0.5.1", "report");

    expect(result.steps[0].output).toEqual({ version: "0.5.1" });
    expect(row.piece_source).toBe("activepieces");
    expect(sources.requests).toContain(
      `/cdn/${AP.replace("/", "-")}-0.5.1.tgz`,
    );
  });

  it("honours a package piece's entryUrl", async () => {
    const { result, row } = await run(SERVED, "3.0.0", "report");

    expect(result.steps[0].output).toEqual({ version: "3.0.0" });
    expect(row.piece_source).toBe("local");
    expect(sources.requests).toContain("/pkg/served/index.js");
  });
});

describe("a pin no source has", () => {
  it("runs the newest compatible version, as a note and not a warning", async () => {
    const {
      result,
      row,
      run: journal,
    } = await run(REGISTRY, "1.1.0", "report");

    expect(result.status).toBe("SUCCEEDED");
    expect(result.steps[0].output).toEqual({ version: "1.2.0-local" });
    expect(row).toMatchObject({
      piece_version: "1.2.0",
      piece_source: "local",
      version_match: "compatible",
      version_note: "Pinned 1.1.0 is not available; runs 1.2.0 from local",
    });
    expect(journal.warnings).toBe(0);
  });

  it("falls back across a major, and counts it as a warning", async () => {
    const {
      result,
      row,
      run: journal,
    } = await run(REGISTRY, "3.0.0", "report");

    expect(result.status).toBe("SUCCEEDED");
    expect(row).toMatchObject({
      piece_version: "2.1.0",
      version_match: "fallback",
    });
    expect(journal.warnings).toBe(1);
  });

  it("never takes a registry-owned name from npm", async () => {
    const before = sources.requests.length;
    const { result, row } = await run(OWNED, "2.0.0", "report");

    // npm has 2.0.0 exactly; the registry owns the name and has only 1.0.0.
    expect(result.steps[0].output).toEqual({ version: "1.0.0" });
    expect(row).toMatchObject({
      piece_source: "registry",
      version_match: "fallback",
    });
    const asked = sources.requests.slice(before);
    expect(asked.some((path) => path.startsWith("/npm/"))).toBe(false);
  });
});

describe("a closest version without the block", () => {
  it("skips releases without the action, and says which", async () => {
    const {
      result,
      row,
      run: journal,
    } = await run(HTTP, "0.0.0", "send_request");

    expect(result.status).toBe("SUCCEEDED");
    expect(result.steps[0].output).toEqual({ version: "0.1.0" });
    expect(row).toMatchObject({
      piece_version: "0.1.0",
      piece_source: "activepieces",
      version_match: "fallback",
      version_note:
        "Pinned 0.0.0 is not available; runs 0.1.0 from activepieces. " +
        'Skipped 0.0.2: it has no action "send_request". ' +
        'Skipped 0.0.1: it has no action "send_request"',
    });
    expect(journal.warnings).toBe(1);
  });

  it("describes at most five candidates, each once", async () => {
    const block = action(MANY, "1.0.0", "send");
    const first = await service.resolveBlock(block);

    expect(first.match).toBe("missing");
    expect(first.note).toBe(
      `${MANY} has no action "send" in 1.0.0, 1.5.0, 1.4.0, 1.3.0, 1.2.0; ` +
        "1 more versions not checked (limit 5)",
    );
    const tarballs = () =>
      sources.requests.filter((path) => path.includes("piece-many/-/"));
    expect(tarballs()).toHaveLength(5);
    expect(tarballs().some((path) => path.includes("1.1.0"))).toBe(false);

    await service.resolveBlock(block);
    expect(tarballs()).toHaveLength(5);
  });
});

describe("a host-bound piece", () => {
  it("always runs the installed version, whatever it pins", async () => {
    const before = sources.requests.length;
    const { result, row } = await run(HOST_BOUND, "9.9.9", "report");

    expect(result.steps[0].output).toEqual({ version: "1.0.0" });
    expect(row).toMatchObject({
      piece_version: "1.0.0",
      piece_source: "local",
      version_match: "installed",
      version_note: "Runs the installed 1.0.0; the block pins 9.9.9",
    });
    expect(sources.requests.slice(before)).toEqual([]);
  });
});

describe("what fails", () => {
  it("fails a step whose version has no such action", async () => {
    const { result } = await run(REGISTRY, "2.1.0", "nope");

    expect(result.status).toBe("FAILED");
    expect(result.steps[0].error).toBe(
      `${REGISTRY} has no action "nope" in 2.1.0, 1.2.0, 1.0.0`,
    );
  });

  // The model refuses an inexact version; this covers one synced from elsewhere.
  it("refuses a version that is not exact", async () => {
    const resolution = await service.resolveBlock(
      action(LOCAL, "^1.0.0", "report"),
    );

    expect(resolution.match).toBe("missing");
    expect(resolution.note).toBe(
      `${LOCAL} action "report" pins "^1.0.0", which is not an exact semver version`,
    );
  });

  it("fails a piece no source has", async () => {
    const { result } = await run("@acme/piece-nowhere", "1.0.0", "report");

    expect(result.status).toBe("FAILED");
    expect(result.steps[0].error).toBe(
      "No source has the piece @acme/piece-nowhere",
    );
  });
});

describe("design time", () => {
  it("describes the version that runs, not the one pinned", async () => {
    const descriptor = (await service.blockDescriptor(
      action(REGISTRY, "2.0.0", "report"),
    )) as { displayName: string } | null;

    expect(descriptor?.displayName).toBe("Fixture 2.1.0");
  });

  it("builds an output tree from the version that runs", async () => {
    const tree = await service.blockOutputTree({
      pieceName: REGISTRY,
      pieceVersion: "1.0.0",
      kind: "trigger",
      name: "tick",
    });

    expect(tree).toMatchObject({ source: "sample" });
    expect(tree.nodes.map((node) => node.name)).toEqual(["version"]);
  });
});

// The operation the read model hands the runtime for a workflow edit.
let ordinal = 0;
function workflowOp(id: string): OperationWithContext {
  ordinal += 1;
  return {
    operation: {
      index: ordinal,
      timestampUtcMs: `${ordinal}`,
      action: { type: "EDIT", input: {} },
      resultingState: JSON.stringify(documents.byId.get(id)!.state.global),
    },
    context: {
      documentId: id,
      documentType: "powerhouse/workflow",
      scope: "global",
      branch: "main",
      ordinal,
    },
  } as unknown as OperationWithContext;
}

describe("trigger arming", () => {
  it("records the version a trigger armed with on its state row", async () => {
    const id = "wf-trigger";
    documents.apply(
      id,
      actions.setTrigger({
        id: "t1",
        pieceName: REGISTRY,
        pieceVersion: "1.1.0",
        triggerName: "tick",
        config: {},
      }),
      actions.publishWorkflow({ publishedAt: "2026-01-01T00:00:00.000Z" }),
      actions.setWorkflowStatus({ status: "ENABLED" }),
    );

    await service.onOperations([workflowOp(id)]);

    const store = (await service.store())!;
    await vi.waitFor(
      async () =>
        expect((await store.getTriggerState(id))?.status).toBe("ENABLED"),
      { timeout: 20_000 },
    );
    expect(await store.getTriggerState(id)).toMatchObject({
      piece_version: "1.2.0",
      piece_source: "local",
      version_match: "compatible",
      version_note: "Pinned 1.1.0 is not available; runs 1.2.0 from local",
    });
    const [state] = (await service.triggerStates(CTX)).filter(
      (row) => row.workflow_id === id,
    );
    expect(state.version_match).toBe("compatible");
  });
});

describe("the editor's view of a draft", () => {
  const id = "wf-draft";

  beforeAll(() => {
    documents.apply(
      id,
      actions.setTrigger({
        id: "t1",
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "manual",
        config: {},
      }),
      ...[
        action(REGISTRY, "1.1.0", "report"),
        action(HOST_BOUND, "9.9.9", "report"),
        action("@acme/piece-nowhere", "1.0.0", "report"),
        action(CORE_PIECE_NAME, CORE_PIECE_VERSION, "branch"),
        action(LOCAL, "1.0.0", "report"),
      ].map((block, index) =>
        actions.addStep({
          id: `s${index + 1}`,
          key: `s${index + 1}`,
          name: `Step ${index + 1}`,
          pieceName: block.pieceName,
          pieceVersion: block.pieceVersion,
          actionName: block.name,
          config: {},
        }),
      ),
    );
  });

  it("resolves every block the way a run would, with the newest version", async () => {
    const resolutions = await service.blockResolutions(id, CTX);

    expect(resolutions).toEqual([
      {
        stepId: "t1",
        pieceName: CORE_PIECE_NAME,
        pieceVersion: CORE_PIECE_VERSION,
        name: "manual",
        kind: "trigger",
        resolvedVersion: CORE_PIECE_VERSION,
        source: "local",
        match: "installed",
        note: null,
        latestVersion: CORE_PIECE_VERSION,
      },
      {
        stepId: "s1",
        pieceName: REGISTRY,
        pieceVersion: "1.1.0",
        name: "report",
        kind: "action",
        resolvedVersion: "1.2.0",
        source: "local",
        match: "compatible",
        note: "Pinned 1.1.0 is not available; runs 1.2.0 from local",
        latestVersion: "2.1.0",
      },
      {
        stepId: "s2",
        pieceName: HOST_BOUND,
        pieceVersion: "9.9.9",
        name: "report",
        kind: "action",
        resolvedVersion: "1.0.0",
        source: "local",
        match: "installed",
        note: "Runs the installed 1.0.0; the block pins 9.9.9",
        latestVersion: "1.0.0",
      },
      {
        stepId: "s3",
        pieceName: "@acme/piece-nowhere",
        pieceVersion: "1.0.0",
        name: "report",
        kind: "action",
        resolvedVersion: null,
        source: null,
        match: "missing",
        note: "No source has the piece @acme/piece-nowhere",
        latestVersion: null,
      },
      expect.objectContaining({
        stepId: "s4",
        pieceName: CORE_PIECE_NAME,
        name: "branch",
        match: "installed",
        note: null,
      }),
      {
        stepId: "s5",
        pieceName: LOCAL,
        pieceVersion: "1.0.0",
        name: "report",
        kind: "action",
        resolvedVersion: "1.0.0",
        source: "local",
        match: "exact",
        note: null,
        latestVersion: "1.0.0",
      },
    ]);
  });

  it("refuses a caller the subgraph cannot identify", async () => {
    await expect(service.blockResolutions(id)).rejects.toThrow(
      "authenticated request",
    );
  });
});

describe("configHash", () => {
  it("ignores key order and the pinned version", () => {
    const tick = (pieceVersion: string) => ({
      pieceName: LOCAL,
      pieceVersion,
      kind: "trigger" as const,
      name: "tick",
    });
    expect(configHash(tick("1.0.0"), { a: 1, b: { c: 2, d: [3] } })).toBe(
      configHash(tick("2.0.0"), { b: { d: [3], c: 2 }, a: 1 }),
    );
    expect(configHash(tick("1.0.0"), { a: 1 })).not.toBe(
      configHash(tick("1.0.0"), { a: 2 }),
    );
  });
});
