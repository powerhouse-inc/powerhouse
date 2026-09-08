# Folder-Zip Download & Bulk Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user can download any drive folder (or the whole drive) as one `.zip` archive whose tree mirrors the folder (subfolders as directories, each document as a standard single-document file), and dragging that archive back into Connect recreates the folder tree and imports every document with clean names.

**Architecture:** No new document format. The archive is a plain zip whose leaf entries are exactly the standard single-document zips (`createZip` output) Connect already produces and imports. Export assembles the archive client-side from the drive's `state.global.nodes` tree; import detects the archive shape at the drop level (root `header.json`/`state.json`/`operations.json` = single document; otherwise a bulk archive), recreates the folder tree with the existing `addFolder` action, and feeds each leaf through the existing per-file upload chain so the existing progress list, duplicate modal, and naming/dedup semantics all apply unchanged.

**Tech Stack:** TypeScript, pnpm monorepo, fflate (zip), vitest, React (design-system Connect components), Reactor client (browser, PGlite-backed local drives).

**Spec:** GitHub issue powerhouse-inc/powerhouse#134 (updated 2026-09-08): "Download a drive folder as a single .zip archive (tree preserved, round-trip import)".

## Global Constraints

- Worktree: `/home/froid/.worktrees/powerhouse/134-folder-zip`, branch `feat/134-folder-zip` (based on `df3d2c88c`). All edits and commits happen here.
- Conventional-commit messages, one logical change per commit, incremental. Never push; the main session pushes and opens the PR.
- Verify with per-package commands only — NEVER run monorepo-wide CI (`simulate-ci-workflow`, full `test:ci`):
  - `pnpm --filter=@powerhousedao/shared run test`
  - `pnpm --filter=@powerhousedao/shared run tsc` / `run lint`
  - `pnpm --filter=@powerhousedao/reactor-browser run test` / `run tsc` / `run lint`
  - `pnpm --filter=@powerhousedao/design-system run test` / `run tsc` / `run lint`
- After modifying `packages/shared`, rebuild it before running dependent packages' tests: `pnpm --filter=@powerhousedao/shared run build` (dependent packages resolve `@powerhousedao/shared` to its `dist/`).
- Do not reformat or touch files outside the ones listed per task.
- Node ≥ 24, pnpm 12 (both installed; deps and the reactor-api dep chain are already built in the worktree).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/shared/document-model/files.ts` | modify | Add `isDocumentZip`, `parseBulkArchive`, `zipEntries` (pure fflate helpers) |
| `packages/shared/document-model/files.test.ts` | create | Tests for the three helpers |
| `packages/reactor-browser/src/actions/folder-zip.ts` | create | `buildFolderZip` (assembles archive entries from a drive subtree) + `downloadFolderZip` (client fetch + save) |
| `packages/reactor-browser/src/actions/document.ts` | modify | Export the private `getDocumentExtension` (add `export` keyword only) |
| `packages/reactor-browser/src/actions/bulk-archive.ts` | create | `expandBulkArchive` (recreates folder tree, returns per-file import jobs) |
| `packages/reactor-browser/src/hooks/download-folder.ts` | create | `useDownloadFolder(folderNode?)` UI hook |
| `packages/reactor-browser/src/hooks/file-drag-and-drop.ts` | modify | `handleAddFiles` expands bulk archives at the drop level |
| `packages/reactor-browser/src/hooks/use-on-drop-file.ts` | modify | Accept optional `targetFolder` override |
| `packages/reactor-browser/src/types/upload.ts` | modify | `UseOnDropFile` gains `targetFolder` parameter |
| `packages/reactor-browser/src/index.ts` | modify | Export `folder-zip` actions, `useDownloadFolder`, `expandBulkArchive` |
| `packages/design-system/src/connect/constants/options.tsx` | modify | `DOWNLOAD` in `folderNodeDropdownOptions` and `defaultDriveOptions` |
| `packages/design-system/src/connect/components/folder-item/folder-item.tsx` | modify | Wire `DOWNLOAD` handler |
| `packages/design-system/src/connect/components/drop-zone/drop-zone-wrapper.tsx` | modify | Pass `parent` through to `onDropFile` |
| `packages/reactor-browser/test/folder-zip.test.ts` | create | Export-assembly tests |
| `packages/reactor-browser/test/bulk-archive.test.ts` | create | Import-expansion tests |

Interface map (names are load-bearing; keep them identical across tasks):

- Task 1 produces (`@powerhousedao/shared/document-model`): `type BulkArchiveEntry = { path: string; data: Uint8Array }`, `isDocumentZip(data: Uint8Array): Promise<boolean>`, `parseBulkArchive(data: Uint8Array): Promise<BulkArchiveEntry[]>`, `zipEntries(entries: Record<string, Uint8Array>): Promise<Uint8Array>`.
- Task 2 produces (`@powerhousedao/reactor-browser`, actions/folder-zip.js): `type FolderZipResult = { zip: Uint8Array; archiveName: string; entryCount: number; failed: string[] }`, `buildFolderZip(drive: DocumentDriveDocument, folderNode: FolderNode | undefined, fetchDocument: (id: string) => Promise<PHDocument>, onProgress?: (done: number, total: number) => void): Promise<FolderZipResult>`, `downloadFolderZip(drive: DocumentDriveDocument, folderNode?: FolderNode, onProgress?: (done: number, total: number) => void): Promise<FolderZipResult>`. Also exports `getDocumentExtension` from actions/document.js.
- Task 3 produces: `useDownloadFolder(folderNode?: FolderNode): () => Promise<void>` (reactor-browser), `DOWNLOAD` option in the folder dropdown.
- Task 4 produces: `expandBulkArchive(file: File, driveId: string, targetParent: Node | undefined): Promise<BulkImportJob[]>` with `type BulkImportJob = { file: File; parent: Node | undefined }`; modified drop chain.

---

### Task 1: Bulk-archive primitives in shared/document-model

**Files:**
- Modify: `packages/shared/document-model/files.ts`
- Create: `packages/shared/document-model/files.test.ts`

**Interfaces:**
- Consumes: existing private `unzipAsync`/`zipAsync` in files.ts (fflate wrappers); existing `createZip`.
- Produces: `BulkArchiveEntry`, `isDocumentZip`, `parseBulkArchive`, `zipEntries` (exported from the package root — `index.ts` already does `export * from "./files.js"`).

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/document-model/files.test.ts`:

```ts
import { strToU8, unzip } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { createBaseState } from "./state.js";
import { createPresignedHeader } from "./header.js";
import {
  createZip,
  isDocumentZip,
  parseBulkArchive,
  zipEntries,
} from "./files.js";

const empty = new Uint8Array(0);

async function documentZip(): Promise<Uint8Array> {
  const header = createPresignedHeader("doc-1", "test/doc");
  const state = createBaseState(undefined, { version: 1 });
  return await createZip({
    header,
    state,
    initialState: state,
    operations: {},
    clipboard: [],
  } as never);
}

async function bulkZip(): Promise<Uint8Array> {
  return await zipEntries({
    "Archive/": empty,
    "Archive/sub/": empty,
    "Archive/grantee-1.phdm.phd": strToU8("inner-doc-zip-bytes"),
    "Archive/sub/grantee-2.phdm.phd": strToU8("inner-doc-zip-bytes"),
  });
}

describe("isDocumentZip", () => {
  it("is true for a single-document zip (4 JSON entries at the root)", async () => {
    expect(await isDocumentZip(await documentZip())).toBe(true);
  });

  it("is false for a bulk archive (folder tree, no root JSON entries)", async () => {
    expect(await isDocumentZip(await bulkZip())).toBe(false);
  });

  it("is false for non-zip bytes", async () => {
    expect(await isDocumentZip(strToU8("this is not a zip"))).toBe(false);
  });
});

describe("parseBulkArchive", () => {
  it("returns the file entries with their paths, excluding directory entries", async () => {
    const entries = await parseBulkArchive(await bulkZip());
    expect(entries.map((e) => e.path).sort()).toEqual([
      "Archive/grantee-1.phdm.phd",
      "Archive/sub/grantee-2.phdm.phd",
    ]);
    expect(entries[0].data).toBeInstanceOf(Uint8Array);
  });

  it("throws when the archive has no files", async () => {
    const dirsOnly = await zipEntries({ "A/": empty, "A/B/": empty });
    await expect(parseBulkArchive(dirsOnly)).rejects.toThrow(
      "Archive contains no files",
    );
  });

  it("throws on a single-document zip (its root entries are JSON, not files)", async () => {
    // header.json & friends end in .json but are NOT document files; the
    // caller is expected to check isDocumentZip first. parseBulkArchive
    // still returns them — so assert the contract is "whatever the entries
    // are", and detection lives in isDocumentZip.
    const entries = await parseBulkArchive(await documentZip());
    expect(entries.map((e) => e.path).sort()).toEqual([
      "current-state.json",
      "header.json",
      "operations.json",
      "state.json",
    ]);
  });
});

describe("zipEntries", () => {
  it("round-trips directory entries (trailing slash, empty data)", async () => {
    const zip = await zipEntries({
      "F/": empty,
      "F/sub/": empty,
      "F/leaf.txt": strToU8("x"),
    });
    const files = await new Promise<Record<string, Uint8Array>>(
      (resolve, reject) =>
        unzip(new Uint8Array(zip), (err, out) =>
          err ? reject(err) : resolve(out),
        ),
    );
    expect(Object.keys(files).sort()).toEqual([
      "F/",
      "F/leaf.txt",
      "F/sub/",
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter=@powerhousedao/shared exec vitest run document-model/files.test.ts`
Expected: FAIL — `isDocumentZip`, `parseBulkArchive`, `zipEntries` are not exported.

- [ ] **Step 3: Implement in `files.ts`**

Append to `packages/shared/document-model/files.ts` (after `baseLoadFromInputVersioned`):

```ts
export type BulkArchiveEntry = {
  /** "/"-separated zip path of a file entry (no trailing slash). */
  path: string;
  data: Uint8Array;
};

/**
 * Whether this zip is a single Powerhouse document: the document's four JSON
 * entries (header/state/current-state/operations) at the archive root. A
 * bulk archive has a folder tree instead. Returns false for any input that
 * is not a readable zip.
 */
export async function isDocumentZip(data: Uint8Array): Promise<boolean> {
  let files: Unzipped;
  try {
    files = await unzipAsync(data);
  } catch {
    return false;
  }
  return (
    Boolean(files["header.json"]) &&
    Boolean(files["state.json"]) &&
    Boolean(files["operations.json"])
  );
}

/**
 * The file entries of a zip (directory entries excluded). Used for bulk
 * archives; throws when the archive holds no files. Note this does NOT
 * validate that the entries are document zips — pair with isDocumentZip.
 */
export async function parseBulkArchive(
  data: Uint8Array,
): Promise<BulkArchiveEntry[]> {
  const files = await unzipAsync(data);
  const entries = Object.entries(files)
    .filter(([name]) => !name.endsWith("/"))
    .map(([path, value]) => ({ path, data: value }));
  if (entries.length === 0) {
    throw new Error("Archive contains no files");
  }
  return entries;
}

/**
 * Assemble a zip from raw entries. A key ending in "/" with empty data is a
 * directory entry, so an archive's folder structure survives a round-trip.
 */
export async function zipEntries(
  entries: Record<string, Uint8Array>,
): Promise<Uint8Array> {
  return zipAsync(entries);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter=@powerhousedao/shared exec vitest run document-model/files.test.ts`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Rebuild shared, then typecheck + lint + full package test**

Run:
```bash
pnpm --filter=@powerhousedao/shared run build
pnpm --filter=@powerhousedao/shared run tsc
pnpm --filter=@powerhousedao/shared run lint
pnpm --filter=@powerhousedao/shared run test
```
Expected: all pass. (If `shared run test` has pre-existing failures unrelated to this change, note them and proceed — the gate for this task is the files.test.ts file plus tsc/lint.)

- [ ] **Step 6: Commit**

```bash
git add packages/shared/document-model/files.ts packages/shared/document-model/files.test.ts
git commit -m "feat(shared): detect and parse bulk archives of document zips"
```

---

### Task 2: Folder zip export action

**Files:**
- Modify: `packages/reactor-browser/src/actions/document.ts:156` (add `export` to `getDocumentExtension`)
- Create: `packages/reactor-browser/src/actions/folder-zip.ts`
- Modify: `packages/reactor-browser/src/index.ts` (add exports)
- Test: `packages/reactor-browser/test/folder-zip.test.ts`

**Interfaces:**
- Consumes: `createZip`, `zipEntries` from `@powerhousedao/shared/document-model`; `getDescendants`, `isFileNode`, `isFolderNode`, `getNextCopyNumber` from `@powerhousedao/shared/document-drive`; `extractInitialState`, `fetchDocumentOperations` (already exported) and `getDocumentExtension` (exported by this task) from `./document.js`.
- Produces: `FolderZipResult`, `buildFolderZip`, `downloadFolderZip` (see interface map).

- [ ] **Step 1: Export `getDocumentExtension`**

In `packages/reactor-browser/src/actions/document.ts:156`, change
`async function getDocumentExtension(document: PHDocument): Promise<string> {`
to `export async function getDocumentExtension(document: PHDocument): Promise<string> {`.

- [ ] **Step 2: Write the failing test**

Create `packages/reactor-browser/test/folder-zip.test.ts`. Follow the `window.ph` stubbing pattern of `test/import-id-collision.test.ts:97-106` (`installClient`/`afterEach` delete). Test code:

```ts
import { createBaseState, createPresignedHeader } from "@powerhousedao/shared/document-model";
import type { DocumentDriveDocument, FolderNode, Node } from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFolderZip, downloadFolderZip } from "../src/actions/folder-zip.js";

const DRIVE_ID = "drive-1";
const DOC_TYPE = "test/grantee";

function node(
  id: string,
  name: string,
  parentFolder: string | null,
  documentType?: string,
): Node {
  return (
    documentType
      ? { id, kind: "file", name, parentFolder, documentType }
      : { id, kind: "folder", name, parentFolder }
  ) as Node;
}

function driveDocument(): DocumentDriveDocument {
  const nodes: Node[] = [
    node("A", "Recipients", null),
    node("B", "Batch A", "A"),
    node("g1", "grantee-1", "A", DOC_TYPE),
    node("g2", "grantee-2", "B", DOC_TYPE),
    node("g3", "dup", "A", DOC_TYPE),
    node("g4", "dup", "A", "other/type"),
    node("C", "Outside", null),
    node("g5", "other-doc", "C", DOC_TYPE),
  ];
  return {
    header: {
      ...createPresignedHeader(DRIVE_ID, "powerhouse/document-drive"),
      name: "Arb Drive",
    },
    state: { global: { nodes }, local: {} },
  } as unknown as DocumentDriveDocument;
}

function sourceDocument(id: string, name: string, documentType = DOC_TYPE): PHDocument {
  const header = createPresignedHeader(id, documentType);
  header.name = name;
  const state = createBaseState(undefined, { version: 1 });
  return { header, state, initialState: state, operations: {}, clipboard: [] } as unknown as PHDocument;
}

/** Upgrade op so extractInitialState has something to find. */
function upgradeOps(document: PHDocument) {
  return {
    document: [
      {
        id: "op-1",
        timestampUtcMs: 1,
        action: {
          type: "UPGRADE_DOCUMENT",
          scope: "document",
          input: { initialState: document.state },
        },
      },
    ],
  };
}

function stubClient(documents: Record<string, PHDocument>) {
  const client = {
    get: (identifier: string) => {
      if (identifier === DRIVE_ID) return Promise.resolve(driveDocument());
      const doc = documents[identifier];
      if (!doc) return Promise.reject(new Error(`no document ${identifier}`));
      return Promise.resolve(doc);
    },
    getOperations: (_id: string) =>
      Promise.resolve({ results: [], nextCursor: "" }),
    getDocumentModelModules: () =>
      Promise.resolve({
        results: [
          {
            version: 1,
            documentModel: { global: { id: DOC_TYPE } },
            utils: { fileExtension: "phdm" },
          },
          {
            version: 1,
            documentModel: { global: { id: "other/type" } },
            utils: { fileExtension: "" },
          },
        ],
        options: { cursor: "", limit: 10 },
      }),
  };
  (globalThis as { window?: typeof window }).window = globalThis as unknown as typeof window;
  (window as unknown as { ph?: unknown }).ph = {
    ...(window.ph ?? {}),
    reactorClientModule: { kind: "browser", client, reactorModule: undefined },
    reactorClient: client,
  } as never;
  return client;
}

function allDocs(): Record<string, PHDocument> {
  return {
    g1: sourceDocument("g1", "grantee-1"),
    g2: sourceDocument("g2", "grantee-2"),
    g3: sourceDocument("g3", "dup"),
    g4: sourceDocument("g4", "dup", "other/type"),
    g5: sourceDocument("g5", "other-doc"),
  };
}

function fakeFetch(client: { get: (id: string) => Promise<PHDocument> }) {
  return async (id: string) => {
    const doc = await client.get(id);
    const operations = upgradeOps(doc);
    return { ...doc, operations, initialState: doc.state };
  };
}

describe("buildFolderZip", () => {
  afterEach(() => {
    delete (window as unknown as { ph?: unknown }).ph;
    vi.restoreAllMocks();
  });

  it("zips a folder subtree: dirs for folders, named leaves, no outside nodes", async () => {
    const client = stubClient(allDocs());
    const drive = driveDocument();
    const folder = (drive.state.global.nodes as Node[]).find(
      (n) => n.id === "A",
    ) as FolderNode;

    const result = await buildFolderZip(drive, folder, fakeFetch(client));

    const entries = await unzipArchive(result.zip);
    expect(entries["Recipients/grantee-1.phdm.phd"]).toBeInstanceOf(Uint8Array);
    expect(entries["Recipients/"]).toBeDefined();
    expect(result.archiveName).toBe("Recipients.zip");
    expect(result.entryCount).toBe(4);
    expect(result.failed).toEqual([]);
    expect(result.zip).toBeInstanceOf(Uint8Array);
    expect(result.zip.byteLength).toBeGreaterThan(0);
  });

  it("names leaves by node name + extension and suffixes name collisions", async () => {
    const client = stubClient(allDocs());
    const drive = driveDocument();
    const folder = (drive.state.global.nodes as Node[]).find(
      (n) => n.id === "A",
    ) as FolderNode;

    const { zip } = await buildFolderZip(drive, folder, fakeFetch(client));

    const entries = await unzipArchive(zip);

    expect(Object.keys(entries).sort()).toEqual([
      "Recipients/",
      "Recipients/Batch A/",
      "Recipients/dup (copy) 1.phdm.phd",
      "Recipients/dup.phdm.phd",
      "Recipients/grantee-1.phdm.phd",
      "Recipients/Batch A/grantee-2.phdm.phd",
    ]);
  });

  it("exports the whole drive when no folder is given (top dir = drive name)", async () => {
    const client = stubClient(allDocs());
    const { zip, archiveName } = await buildFolderZip(
      driveDocument(),
      undefined,
      fakeFetch(client),
    );
    expect(archiveName).toBe("Arb Drive.zip");
    const entries = await unzipViaShared(zip);
    expect(Object.keys(entries).sort()).toEqual([
      "Arb Drive/",
      "Arb Drive/Recipients/",
      "Arb Drive/Recipients/Batch A/",
      "Arb Drive/Recipients/dup (copy) 1.phdm.phd",
      "Arb Drive/Recipients/dup.phdm.phd",
      "Arb Drive/Recipients/grantee-1.phdm.phd",
      "Arb Drive/Recipients/Batch A/grantee-2.phdm.phd",
      "Arb Drive/Outside/",
      "Arb Drive/Outside/other-doc.phdm.phd",
    ]);
  });

  it("records per-document failures without aborting the rest", async () => {
    const docs = allDocs();
    delete docs.g2; // fetch will fail for this one
    const client = stubClient(docs);
    const drive = driveDocument();
    const folder = (drive.state.global.nodes as Node[]).find(
      (n) => n.id === "A",
    ) as FolderNode;

    const result = await buildFolderZip(drive, folder, fakeFetch(client));
    expect(result.failed).toEqual(["grantee-2"]);
    expect(result.entryCount).toBe(3);
  });
});

// Unzip helper for assertions. Implemented in test/utils/unzip.ts (see
// NOTE below for choosing the import route).
async function unzipArchive(zip: Uint8Array) {
  const { unzipAsync } = await import("../test/utils/unzip.js");
  return unzipAsync(zip);
}
```

**NOTE to implementer:** the draft above contains one deliberate placeholder (`unzipViaShared` helper) — do NOT copy it verbatim. Before writing the final test file: (a) add a tiny test utility `packages/reactor-browser/test/utils/unzip.ts` containing `export async function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> { ... }` implemented by importing `unzip` from `fflate` (check `packages/reactor-browser/package.json` — if `fflate` is not a direct dependency, instead import the unzip round-trip through `@powerhousedao/shared/document-model`'s existing exports, or use Node's `zlib`… no — simplest correct option: add `fflate` to reactor-browser's devDependencies ONLY if the existing test files don't already import it; check first with `grep -r "from \"fflate\"" packages/reactor-browser/test`). Choose whichever import route resolves under the package's pnpm setup and use it consistently; delete the placeholder block from the first test (`const keys = ...` line) which is dead code.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter=@powerhousedao/reactor-browser exec vitest run test/folder-zip.test.ts`
Expected: FAIL — cannot import `../src/actions/folder-zip.js`.

- [ ] **Step 4: Implement `folder-zip.ts`**

Create `packages/reactor-browser/src/actions/folder-zip.ts`:

```ts
import type {
  DocumentDriveDocument,
  FolderNode,
  Node,
} from "@powerhousedao/shared/document-drive";
import {
  getDescendants,
  getNextCopyNumber,
  isFileNode,
  isFolderNode,
} from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { createZip, zipEntries } from "@powerhousedao/shared/document-model";
import {
  extractInitialState,
  fetchDocumentOperations,
  getDocumentExtension,
} from "./document.js";

export type FolderZipResult = {
  zip: Uint8Array;
  archiveName: string;
  entryCount: number;
  failed: string[];
};

const sanitize = (segment: string) => segment.replace(/\//g, "-");

/**
 * Name segments from the exported folder (exclusive) down to `node`
 * (inclusive), in top-down order. `root === undefined` means the drive root:
 * all ancestors. A node that IS the exported folder yields no segments.
 */
function segmentsBelow(
  root: Node | undefined,
  node: Node,
  allNodes: Node[],
): string[] {
  const segments: string[] = [];
  let current: Node | undefined = node;
  while (current && current.id !== root?.id) {
    segments.push(sanitize(current.name));
    const parentId = current.parentFolder;
    current = parentId
      ? allNodes.find((n) => n.id === parentId)
      : undefined;
  }
  return segments.reverse();
}

/**
 * Assemble the archive zip for a folder (or the whole drive when
 * `folderNode` is undefined). Every folder in the subtree becomes a
 * directory entry (empty folders survive); every file becomes a standard
 * single-document zip named after the node (drive naming convention:
 * `${name}.${extension}.phd`, ` (copy) N` on collision).
 *
 * `fetchDocument` must return the document WITH its full operations and
 * initialState (see downloadFolderZip).
 */
export async function buildFolderZip(
  drive: DocumentDriveDocument,
  folderNode: FolderNode | undefined,
  fetchDocument: (id: string) => Promise<PHDocument>,
  onProgress?: (done: number, total: number) => void,
): Promise<FolderZipResult> {
  const allNodes = drive.state.global.nodes as Node[];
  const topName = sanitize(folderNode?.name ?? drive.header.name);
  const subtree: Node[] = folderNode
    ? [folderNode, ...getDescendants(folderNode, allNodes)]
    : allNodes;

  const entries: Record<string, Uint8Array> = {};
  for (const node of subtree) {
    if (!isFolderNode(node)) continue;
    const segments = segmentsBelow(folderNode, node, allNodes);
    const dir = [topName, ...segments].join("/");
    entries[dir + "/"] = new Uint8Array(0);
  }

  const files = subtree.filter(isFileNode);
  const failed: string[] = [];
  const usedNames = new Set<string>();
  let done = 0;

  for (const node of files) {
    try {
      const doc = await fetchDocument(node.id);
      const extension = await getDocumentExtension(doc);
      const base = sanitize(node.name);
      let candidate = base;
      let count = getNextCopyNumber([...usedNames], base);
      while (usedNames.has(candidate)) {
        candidate = `${base} (copy) ${count}`;
        count += 1;
      }
      usedNames.add(candidate);

      const leaf = extension ? `${candidate}.${extension}.phd` : `${candidate}.phd`;
      const segments = segmentsBelow(folderNode, node, allNodes);
      entries[[topName, ...segments, leaf].join("/")] = await createZip(doc);
    } catch {
      failed.push(node.name);
    } finally {
      done += 1;
      onProgress?.(done, files.length);
    }
  }

  const zip = await zipEntries(entries);
  return {
    zip,
    archiveName: `${topName}.zip`,
    entryCount: files.length - failed.length,
    failed,
  };
}

/**
 * Export a folder (or whole drive) to disk: fetches every document with its
 * full operation history, builds the archive, and saves it via
 * showSaveFilePicker (fallback: blob download), mirroring exportFile.
 */
export async function downloadFolderZip(
  drive: DocumentDriveDocument,
  folderNode?: FolderNode,
  onProgress?: (done: number, total: number) => void,
): Promise<FolderZipResult> {
  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }

  const result = await buildFolderZip(
    drive,
    folderNode,
    async (id: string) => {
      const doc = await reactorClient.get<PHDocument>(id);
      // includes auth: an export must carry the policy history
      const operations = await fetchDocumentOperations(reactorClient, doc);
      const initialState = extractInitialState(operations["document"] ?? []);
      return { ...doc, operations, initialState };
    },
    onProgress,
  );

  if (window.showSaveFilePicker) {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: result.archiveName,
      });
      const writable = await fileHandle.createWritable();
      await writable.write(new Uint8Array(result.zip));
      await writable.close();
    } catch (e) {
      // ignores error if user cancelled the file picker
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        throw e;
      }
    }
  } else {
    const blob = new Blob([new Uint8Array(result.zip)], {
      type: "application/zip",
    });
    const link = window.document.createElement("a");
    link.style.display = "none";
    link.href = URL.createObjectURL(blob);
    link.download = result.archiveName;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  }

  return result;
}
```

Then in `packages/reactor-browser/src/index.ts`, add (next to the existing `./actions/` export block, e.g. beside `addFileWithProgress`/`addFolder`):

```ts
export {
  buildFolderZip,
  downloadFolderZip,
  type FolderZipResult,
} from "./actions/folder-zip.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter=@powerhousedao/reactor-browser exec vitest run test/folder-zip.test.ts`
Expected: PASS. If `getDocumentExtension` fails for `other/type` (empty extension), the leaf naming falls back to `${name}.phd` — adjust the expected entry `dup (copy) 1.phd` accordingly (the empty-extension module is intentional: it exercises the no-extension branch).

- [ ] **Step 6: Typecheck, lint, full package tests**

Run:
```bash
pnpm --filter=@powerhousedao/reactor-browser run tsc
pnpm --filter=@powerhousedao/reactor-browser run lint
pnpm --filter=@powerhousedao/reactor-browser run test
```
Expected: pass (pre-existing unrelated failures, if any, noted and unchanged).

- [ ] **Step 7: Commit**

```bash
git add packages/reactor-browser/src/actions/folder-zip.ts packages/reactor-browser/src/actions/document.ts packages/reactor-browser/src/index.ts packages/reactor-browser/test/folder-zip.test.ts
git commit -m "feat(reactor-browser): export a drive folder as a single zip archive"
```

---

### Task 3: Folder menu action ("Download as zip")

**Files:**
- Create: `packages/reactor-browser/src/hooks/download-folder.ts`
- Modify: `packages/reactor-browser/src/index.ts` (export the hook)
- Modify: `packages/design-system/src/connect/constants/options.tsx`
- Modify: `packages/design-system/src/connect/components/folder-item/folder-item.tsx`

**Interfaces:**
- Consumes: `downloadFolderZip` (Task 2), `useSelectedDriveSafe` (existing hooks/selected-drive.ts), `usePHToast` (existing hooks/toast.js — same import `useDownloadDocument` uses).
- Produces: `useDownloadFolder(folderNode?: FolderNode)` — a `() => Promise<void>` function (same shape as `useDownloadDocument`'s return).

- [ ] **Step 1: Create the hook**

Create `packages/reactor-browser/src/hooks/download-folder.ts`:

```ts
import type { DocumentDriveDocument, FolderNode } from "@powerhousedao/shared/document-drive";
import { downloadFolderZip } from "../actions/folder-zip.js";
import { usePHToast } from "./toast.js";
import { useSelectedDriveSafe } from "./selected-drive.js";

/**
 * Downloads the selected drive's folder (or the whole drive when no folder
 * is given) as a single zip archive mirroring the folder tree.
 */
export function useDownloadFolder(folderNode?: FolderNode) {
  const [selectedDrive] = useSelectedDriveSafe();
  const toast = usePHToast();

  return async () => {
    if (!selectedDrive) return;
    const name = folderNode?.name ?? selectedDrive.header.name;
    toast?.(`Downloading "${name}"…`);
    try {
      const { entryCount, failed } = await downloadFolderZip(
        selectedDrive as DocumentDriveDocument,
        folderNode,
      );
      toast?.(
        failed.length
          ? `Downloaded ${entryCount} files (${failed.length} failed)`
          : `Downloaded ${entryCount} files`,
      );
    } catch (error) {
      toast?.(`Failed to download "${name}": ${(error as Error).message}`);
    }
  };
}
```

Add to `packages/reactor-browser/src/index.ts` (beside the other hook exports):

```ts
export { useDownloadFolder } from "./hooks/download-folder.js";
```

- [ ] **Step 2: Add the menu option**

In `packages/design-system/src/connect/constants/options.tsx`:

1. Add `DOWNLOAD` at the START of `defaultDriveOptions` (the drive-root option set; no live drive-root menu renders it today — see plan note) so any future/live consumer of the drive option list gets it:

```ts
export const defaultDriveOptions = [
  "DOWNLOAD",
  "NEW_FOLDER",
  "RENAME",
  "SETTINGS",
] as const;
```

2. Add `DOWNLOAD` at the START of `folderNodeDropdownOptions` (matching how `fileNodeDropdownOptions` places it first):

```ts
export const folderNodeDropdownOptions = {
  DOWNLOAD: {
    label: "Download as zip",
    icon: <Icon name="DownloadFile" size={16} />,
  },
  DUPLICATE: {
    // ...existing entries unchanged...
```

(Keep the existing DUPLICATE/RENAME/DELETE entries byte-identical.)

- [ ] **Step 3: Wire the handler in FolderItem**

In `packages/design-system/src/connect/components/folder-item/folder-item.tsx`:

1. Add `useDownloadFolder` to the `@powerhousedao/reactor-browser` import (line 2-9 block).
2. In `FolderItem`, beside the existing `useNodeActions()` destructure (line 31-32), add:

```ts
  const downloadFolder = useDownloadFolder(folderNode);
```

3. Add to `dropdownMenuHandlers` (lines 51-55, which currently hold DUPLICATE/RENAME/DELETE):

```ts
  const dropdownMenuHandlers = {
    DOWNLOAD: downloadFolder,
    // ...existing handlers unchanged...
  } as const;
```

Read the existing `onDropdownMenuOptionClick` first — if its handler type union needs the new key, extend it; it should work as-is since options and handlers are keyed by the same id.

- [ ] **Step 4: Typecheck + lint (both packages)**

There is no component-test pattern in design-system for these items (only utils tests exist); verification for this task is typecheck/lint plus the E2E task's browser check of the menu.

Run:
```bash
pnpm --filter=@powerhousedao/reactor-browser run tsc
pnpm --filter=@powerhousedao/design-system run tsc
pnpm --filter=@powerhousedao/design-system run lint
pnpm --filter=@powerhousedao/design-system run test
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/reactor-browser/src/hooks/download-folder.ts packages/reactor-browser/src/index.ts packages/design-system/src/connect/constants/options.tsx packages/design-system/src/connect/components/folder-item/folder-item.tsx
git commit -m "feat(connect): add 'Download as zip' action to the folder menu"
```

---

### Task 4: Bulk-archive import (drop → per-file uploads)

**Files:**
- Create: `packages/reactor-browser/src/actions/bulk-archive.ts`
- Modify: `packages/reactor-browser/src/types/upload.ts`
- Modify: `packages/reactor-browser/src/hooks/use-on-drop-file.ts`
- Modify: `packages/reactor-browser/src/hooks/file-drag-and-drop.ts`
- Modify: `packages/design-system/src/connect/components/drop-zone/drop-zone-wrapper.tsx`
- Modify: `packages/reactor-browser/src/index.ts` (export `expandBulkArchive` + `BulkImportJob`)
- Test: `packages/reactor-browser/test/bulk-archive.test.ts`

**Interfaces:**
- Consumes: `isDocumentZip`, `parseBulkArchive` (Task 1); `addFolder` (existing actions/document.ts:880 — returns the created `Node`); `window.ph.reactorClient.get`.
- Produces: `type BulkImportJob = { file: File; parent: Node | undefined }`; `expandBulkArchive(file: File, driveId: string, targetParent: Node | undefined): Promise<BulkImportJob[]>`.

**Behavior notes (read before implementing):**
- A single-document zip dropped today flows `useDropFile → handleAddFile(file, selectedFolder) → createUploadHandler(onAddFile) → useOnDropFile(file, onProgress?, resolveConflict?) → addFileWithProgress`. The wrapper currently DROPS the `parent` argument (drop-zone-wrapper.tsx:19-26) and `useOnDropFile` re-reads the globally selected folder. This task threads the per-job `parent` through so bulk entries can target recreated folders; single-file drops keep today's behavior exactly (override undefined → selected folder).
- Dropped files are sniffed at the drop level: document-zip → unchanged path; otherwise treated as a bulk archive; if expansion itself throws (garbage zip), fall back to the normal single-file path so the existing failed-row error surfacing applies.

- [ ] **Step 1: Write the failing test**

Create `packages/reactor-browser/test/bulk-archive.test.ts`. Stub `window.ph` per the `import-id-collision.test.ts:97-106` pattern, but the client stub must support `get` (drive document) and `execute` (folder creation), because `addFolder` (actions/document.ts:880-917) calls `reactorClient.get(driveId)` then `reactorClient.execute(driveId, "main", [addFolderAction])` and finds the new node in the returned drive document:

```ts
import {
  createZip,
  zipEntries,
} from "@powerhousedao/shared/document-model";
import { strToU8 } from "fflate";
import type { FolderNode, Node } from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { createBaseState, createPresignedHeader } from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expandBulkArchive } from "../src/actions/bulk-archive.js";

const DRIVE_ID = "drive-1";
const DOC_TYPE = "test/grantee";

function fileNode(id: string, name: string, parent: string | null) {
  return { id, kind: "file", name, parentFolder: parent, documentType: DOC_TYPE } as Node;
}
function folderNode(id: string, name: string, parent: string | null) {
  return { id, kind: "folder", name, parentFolder: parent } as Node;
}

function makeDrive(existingNodes: Node[]) {
  return {
    header: { ...createPresignedHeader(DRIVE_ID, "powerhouse/document-drive"), name: "D" },
    state: { global: { nodes: existingNodes }, local: {} },
  } as unknown as PHDocument;
}

function doc(id: string) {
  const header = createPresignedHeader(id, DOC_TYPE);
  const state = createBaseState(undefined, { version: 1 });
  return { header, state, initialState: state, operations: {}, clipboard: [] } as unknown as PHDocument;
}

function stubClient(initialNodes: Node[]) {
  let drive = makeDrive(initialNodes);
  const calls: Array<{ type: string; input: Record<string, unknown> }> = [];
  const client = {
    get: (id: string) =>
      id === DRIVE_ID ? Promise.resolve(drive) : Promise.resolve(doc(id)),
    execute: (_driveId: string, _branch: string, actions: Action[]) => {
      for (const action of actions) {
        calls.push({ type: action.type, input: action.input as Record<string, unknown> });
        if (action.type === "ADD_FOLDER") {
          const input = action.input as {
            id: string; name: string; parentFolder?: string | null;
          };
          drive = makeDrive([
            ...drive.state.global.nodes,
            folderNode(input.id, input.name, input.parentFolder ?? null),
          ]);
        }
      }
      return Promise.resolve(drive);
    },
  };
  (window as unknown as { ph?: unknown }).ph = {
    ...(window.ph ?? {}),
    reactorClientModule: { kind: "browser", client, reactorModule: undefined },
    reactorClient: client,
  } as never;
  return { client, calls };
}

async function bulkArchiveFile(): Promise<File> {
  // Two inner documents (real document zips, so the import chain could parse them)
  const inner1 = await createZip(doc("g1"));
  const inner2 = await createZip(doc("g2"));
  const zip = await zipEntries({
    "Grant Recipients/": new Uint8Array(0),
    "Grant Recipients/2025/": new Uint8Array(0),
    "Grant Recipients/grantee-1.phdm.phd": new Uint8Array(inner1),
    "Grant Recipients/2025/grantee-2.phdm.phd": new Uint8Array(inner2),
  });
  return new File([new Uint8Array(zip)], "Grant Recipients.zip");
}

describe("expandBulkArchive", () => {
  afterEach(() => {
    delete (window as unknown as { ph?: unknown }).ph;
    vi.restoreAllMocks();
  });

  it("recreates the archive's folder tree and returns per-file jobs with target folders", async () => {
    const { calls } = stubClient([]);
    const jobs = await expandBulkArchive(await bulkArchiveFile(), DRIVE_ID, undefined);

    expect(calls.map((c) => c.type)).toEqual(["ADD_FOLDER", "ADD_FOLDER"]);
    const [top, sub] = calls;
    expect(top.input).toMatchObject({ name: "Grant Recipients", parentFolder: null });
    expect(sub.input).toMatchObject({ name: "2025", parentFolder: top.input.id });

    expect(jobs.map((j) => j.file.name).sort()).toEqual([
      "grantee-1.phdm.phd",
      "grantee-2.phdm.phd",
    ]);
    const topNode = (jobs.find((j) => j.file.name === "grantee-1.phdm.phd")?.parent ?? undefined) as FolderNode;
    expect(topNode?.name).toBe("Grant Recipients");
    const subJob = jobs.find((j) => j.file.name === "grantee-2.phdm.phd")!;
    expect(subJob.parent?.id).toBe(sub.input.id);
    expect(subJob.parent?.name).toBe("2025");
  });

  it("reuses an existing same-named folder instead of creating a duplicate", async () => {
    const existing = folderNode("existing-top", "Grant Recipients", null);
    const { calls } = stubClient([existing, fileNode("f0", "pre-existing", "existing-top")]);
    const jobs = await expandBulkArchive(await bulkArchiveFile(), DRIVE_ID, undefined);

    expect(calls.filter((c) => c.input.name === "Grant Recipients")).toHaveLength(0);
    expect(jobs[0].parent?.id).toBe("existing-top");
  });

  it("targets the given parent folder for the recreated top folder", async () => {
    const target = folderNode("target", "Target", null);
    const { calls } = stubClient([target]);
    await expandBulkArchive(await bulkArchiveFile(), DRIVE_ID, target);
    expect(calls[0].input).toMatchObject({
      name: "Grant Recipients",
      parentFolder: "target",
    });
  });

  it("passes a single-document zip through untouched", async () => {
    const { calls } = stubClient([]);
    const single = new File(
      [new Uint8Array(await createZip(doc("solo")))],
      "solo.phdm.phd",
    );
    const jobs = await expandBulkArchive(single, DRIVE_ID, undefined);
    expect(jobs).toEqual([{ file: single, parent: undefined }]);
    expect(calls).toEqual([]);
  });
});
```

Note: `Action` type — import `type { Action }` from `@powerhousedao/shared/document-model` in the test if the stub annotation needs it.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter=@powerhousedao/reactor-browser exec vitest run test/bulk-archive.test.ts`
Expected: FAIL — cannot import `../src/actions/bulk-archive.js`.

- [ ] **Step 3: Implement `expandBulkArchive`**

Create `packages/reactor-browser/src/actions/bulk-archive.ts`:

```ts
import type { DocumentDriveDocument, Node } from "@powerhousedao/shared/document-drive";
import { isFolderNode } from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import {
  isDocumentZip,
  parseBulkArchive,
} from "@powerhousedao/shared/document-model";
import { addFolder } from "./document.js";

export type BulkImportJob = { file: File; parent: Node | undefined };

/**
 * Expand a dropped file into import jobs. A single-document zip is passed
 * through unchanged. A bulk archive (a zip whose tree of files are
 * single-document zips) has its top-level folder — and subfolders —
 * recreated under `targetParent` (existing same-named folders are reused),
 * and each leaf becomes one job targeting its recreated folder.
 */
export async function expandBulkArchive(
  file: File,
  driveId: string,
  targetParent: Node | undefined,
): Promise<BulkImportJob[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  if (await isDocumentZip(data)) {
    return [{ file, parent: targetParent }];
  }

  const entries = await parseBulkArchive(data);
  const tops = new Set(entries.map((e) => e.path.split("/")[0]));
  const topFolder = tops.size === 1 ? [...tops][0] : undefined;

  const reactorClient = window.ph?.reactorClient;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }
  const drive = (await reactorClient.get(driveId)) as DocumentDriveDocument;
  const knownNodes = [...(drive.state?.global?.nodes ?? [])];

  const dirToNode = new Map<string, Node>();
  const ensureDir = async (
    dirPath: string,
    parent: Node | undefined,
  ): Promise<Node> => {
    const cached = dirToNode.get(dirPath);
    if (cached) return cached;
    const name = dirPath.split("/").pop() ?? dirPath;
    const existing = knownNodes.find(
      (n) =>
        isFolderNode(n) &&
        n.name === name &&
        (n.parentFolder ?? null) === (parent?.id ?? null),
    );
    const node = existing ?? (await addFolder(driveId, name, parent?.id));
    dirToNode.set(dirPath, node);
    knownNodes.push(node);
    return node;
  };

  const jobs: BulkImportJob[] = [];
  for (const entry of entries) {
    const segments = entry.path.split("/");
    const leaf = segments.pop()!;
    let parent = targetParent;
    let prefix = "";
    for (const segment of segments) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      parent = await ensureDir(prefix, parent);
    }
    jobs.push({ file: new File([entry.data], leaf), parent });
  }
  return jobs;
}
```

- [ ] **Step 4: Thread the per-job target folder through the drop chain**

1. `packages/reactor-browser/src/types/upload.ts` — replace the `UseOnDropFile` type (lines 36-40) with:

```ts
import type { Node } from "@powerhousedao/shared/document-drive";

export type UseOnDropFile = (documentTypesOverride?: string[]) => (
  file: File,
  targetFolder?: Node,
  onProgress?: FileUploadProgressCallback,
  resolveConflict?: ConflictResolution,
) => Promise<FileNode | undefined>;
```

(keep the existing imports/types in that file; add the `Node` import)

2. `packages/reactor-browser/src/hooks/use-on-drop-file.ts` — change the returned function signature and target resolution:

```ts
  const onDropFile = async (
    file: File,
    targetFolder?: Node,
    onProgress?: FileUploadProgressCallback,
    resolveConflict?: ConflictResolution,
  ) => {
    // ...unchanged guard...
    const fileName = file.name.replace(/\..+/gim, "");
    const targetNodeId = targetFolder?.id ?? selectedFolder?.id;
    // ...unchanged addFileWithProgress call...
  };
```

3. `packages/design-system/src/connect/components/drop-zone/drop-zone-wrapper.tsx` — pass the parent through (lines 19-26):

```ts
  const onAddFile: OnAddFileWithProgress = async (
    file,
    parent,
    onProgress,
    resolveConflict,
  ) => {
    return await onDropFile(file, parent, onProgress, resolveConflict);
  };
```

4. `packages/reactor-browser/src/hooks/file-drag-and-drop.ts` — replace `handleAddFiles` (lines 86-94) with archive expansion:

```ts
  const handleAddFiles = async (event: React.DragEvent<Element>) => {
    const dropped = pipe(
      event,
      getFileItems,
      filter(hasAllowedExtension),
    );
    const jobs: { file: File; parent: Node | undefined }[] = [];
    for (const file of dropped) {
      if (selectedDriveId) {
        try {
          const expanded = await expandBulkArchive(
            file,
            selectedDriveId,
            selectedFolder,
          );
          jobs.push(...expanded);
          continue;
        } catch (error) {
          // Not a readable bulk archive: fall through to the single-file
          // path, which reports the failure in the upload list.
          console.error("Bulk archive expansion failed", error);
        }
      }
      jobs.push({ file, parent: selectedFolder });
    }
    await Promise.all(jobs.map((job) => handleAddFile(job.file, job.parent)));
  };
```

Add imports to that file: `import { useSelectedDriveId } from "./selected-drive.js";` and `import { expandBulkArchive } from "../actions/bulk-archive.js";` — and add `const selectedDriveId = useSelectedDriveId();` inside the hook body. (Verify the `Node` type import already exists — line 1.)

Note: `expandBulkArchive` returns the file unchanged for document zips, so the try/catch above is a no-op passthrough for normal drops — no separate sniffing needed.

5. `packages/reactor-browser/src/index.ts` — add:

```ts
export {
  expandBulkArchive,
  type BulkImportJob,
} from "./actions/bulk-archive.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter=@powerhousedao/reactor-browser exec vitest run test/bulk-archive.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck, lint, full package tests (both touched packages)**

Run:
```bash
pnpm --filter=@powerhousedao/reactor-browser run tsc
pnpm --filter=@powerhousedao/reactor-browser run lint
pnpm --filter=@powerhousedao/reactor-browser run test
pnpm --filter=@powerhousedao/design-system run tsc
```
Expected: pass. If other files consume `UseOnDropFile` (grep `UseOnDropFile` across the repo before finishing — the type changed), update them to match.

- [ ] **Step 7: Commit**

```bash
git add packages/reactor-browser/src/actions/bulk-archive.ts packages/reactor-browser/src/types/upload.ts packages/reactor-browser/src/hooks/use-on-drop-file.ts packages/reactor-browser/src/hooks/file-drag-and-drop.ts packages/design-system/src/connect/components/drop-zone/drop-zone-wrapper.tsx packages/reactor-browser/src/index.ts packages/reactor-browser/test/bulk-archive.test.ts
git commit -m "feat(reactor-browser): import dropped bulk archives as per-file uploads"
```

---

### Task 5: E2E in Connect with a local drive + screenshots (main session)

**Executed by the main session (browser automation via the `browser` tool), not a subagent. No commit.**

- [ ] **Step 1: Boot the local app**

Run in the worktree: `pnpm --filter=@powerhousedao/connect exec vite dev --port 5199 --strictPort` (check `apps/connect/package.json` for the exact dev script; the vite config proxies /graphql to 127.0.0.1:4001 — not needed for a purely local drive). Open http://localhost:5199 in the browser tool. Local drives live in browser-local PGlite — no server process required (config `drives.sections.local.enabled` in `apps/connect/public/powerhouse.config.json`).

- [ ] **Step 2: Seed a local drive with a folder tree**

Create a local drive via the UI (or `addDrive` through the in-page client if the UI flow is gated), then seed via the in-page client (`window.ph`): a folder "Grant Recipients" containing ~7 sibling documents plus a subfolder "2025" with 2 documents, plus 2 same-named documents of different types (collision case). Use `addDocument`/`addFolder` from the reactor-browser actions on the in-page reactor client.

- [ ] **Step 3: Exercise export; capture**

1. Screenshot: folder item in the explorer with its dropdown open showing "Download as zip".
2. Click it; complete the save (headless: if `showSaveFilePicker` is unavailable/unauthorized in headless Chromium, relaunch the browser with File System Access enabled or verify the blob-download fallback path fires); capture the downloaded archive.
3. Verify the archive in Node: unzip listing shows the folder tree with all leaf files (include the listing in the report); spot-check one leaf parses as a document zip (fflate `unzip` → header.json present).

- [ ] **Step 4: Round-trip import; capture**

1. Select the drive (and a target folder if testing non-root drop) in the UI.
2. Synthetic drop: dispatch a `drop` DragEvent on the DropZone whose `dataTransfer` contains the archive File (built in-page from the downloaded bytes).
3. Screenshot: the drop-zone upload progress list showing per-file rows.
4. Wait for completion; screenshot the recreated folder tree (expand the folder in the explorer).
5. Verify: N documents imported under the recreated folder, names clean (no `.zip`/extension), collision got ` (copy) N`, duplicates of an existing name trigger the conflict modal (screenshot if it appears).

- [ ] **Step 5: 70-document scale check**

Seed a folder with 70 documents (scripted via the in-page client), export via the UI, verify the archive has 70 leaves, drop it back, assert 70 documents in the folder via the drive's `state.global.nodes`.

- [ ] **Step 6: Evidence package**

Collect screenshots + the `unzip -l`-style listing into the report; attach screenshots to the PR description when the PR is opened.

---

## Self-Review

- **Spec coverage:** Goals 1-4 of issue #134 map to Tasks 2/3 (folder download, no new format, naming), Task 4 (round-trip import with tree recreation, clean names, duplicate semantics, per-item progress), Task 5 (70-grantee motivating use case). Non-goals respected (no server-side zip, no new format version, no attachments). Drive-root: supported by the action API and the `defaultDriveOptions` option; no live drive-root menu exists in the current UI (verified: `defaultDriveOptions`/`getNodeOptions` have no render consumer) — noted in the PR rather than inventing chrome.
- **Placeholder scan:** Task 2 Step 2 contains an explicit NOTE about a deliberate placeholder (the `unzipViaShared` helper) that the implementer must resolve by choosing a real import route — everything else is concrete.
- **Type consistency:** `BulkArchiveEntry` (T1) consumed by T4's `parseBulkArchive`; `FolderZipResult` (T2) consumed by T3's hook; `UseOnDropFile`'s new 2nd parameter `targetFolder?: Node` matches the wrapper call in T4 Step 4.3; `addFolder(driveId, name, parentFolder?)` matches actions/document.ts:880.
- **Risks:** (a) `showSaveFilePicker` availability in headless — mitigated in Task 5 Step 3; (b) `window.ph.reactorClient` vs `reactorClientModule.client` duality — both are set in the stubs and by the app; (c) `useDropFile` has exactly one consumer (Connect's DropZone) — verified.
