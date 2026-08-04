# Connect Document Model Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make document model version upgrades actually work end to end in Connect: fix the plumbing bugs that erase and corrupt version information, add a first-class `upgradeDocument` client API, and surface the whole thing in the UI (toolbar update button, toast on outdated documents, modal on unsupported imports).

**Architecture:** The reactor's `UPGRADE_DOCUMENT` executor (`DocumentActionHandler.executeUpgrade`) already implements multi-step upgrades via `registry.computeUpgradePath` — nothing calls it. This plan (1) fixes version-integrity bugs on the create/import paths, (2) adds the missing trigger API on `IReactorClient` plus a browser action and detection hook, (3) fixes two cache-correctness bugs that would corrupt upgraded documents, and (4) wires detection + trigger into Connect's existing toolbar/toast/modal systems.

**Tech Stack:** TypeScript ESM monorepo (pnpm + nx), vitest, React 19, react-toastify (wrapped), Tailwind.

## Background you need (read once)

- A document's model version lives at `document.state.document.version` (NOT in the header). It is stamped by the genesis `UPGRADE_DOCUMENT` operation (`fromVersion: 0`) at creation and re-stamped by any later version-changing upgrade.
- `document.header.revision` is a per-scope map of `lastOperationIndex + 1` (see `updateDocumentRevision` in [packages/reactor/src/executor/util.ts:180-189](../../packages/reactor/src/executor/util.ts)). This is exactly the "revision snapshot" shape that `UpgradeDocumentActionInput.revision` expects.
- The registry (`IDocumentModelRegistry`) stores modules keyed by `(documentType, version)` and one `UpgradeManifest` per type. `computeUpgradePath(type, from, to)` returns ordered `UpgradeTransition[]`; each transition's `upgradeReducer` is a pure `PHDocument -> PHDocument` function.
- The job executor pins the reducer version to the document's own version: `registry.getModule(type, documentVersion)`, with `version === 0` falling back to latest.
- `test/versioned-documents/` is a complete codegen-generated project with a real 2-version `test/todo` model, a working v1→v2 upgrade manifest, and an editor. Use it for manual verification. `packages/reactor/test/client/versioning.test.ts` has a real 2-version in-memory model + manifest; extend it for integration tests.

## Global Constraints

- Package manager: **pnpm** (never npm/yarn). Run tests from within the owning package directory.
- After changing a package, run `pnpm tsc --build` in that package before running tests in a dependent package.
- ESM import paths with `.js` extensions.
- No emojis anywhere. Avoid `any`; prefer named types. No new inline comments — comment only function/class declarations when they add clarity.
- Error classes: set `name` in the constructor and provide `static isError(error: unknown): error is X` checking `Error.isError(error) && error.name === "..."`.
- Never edit `gen/` folders or files with a `WARNING: DO NOT EDIT` header.
- Group public functions before private functions in classes.
- Commit after each task with a conventional message (`fix(reactor): ...`, `feat(connect): ...`).

## Out of scope (follow-ups, do not attempt here)

- GraphQL `upgradeDocument` mutation and server-side (reactor-api/switchboard) manifest registration.
- Worker-mode reactor (`connect.instance.reactorWorker`, default `false`): `reactor.worker.ts` does not register upgrade manifests and `WorkerPackageLoader` collapses modules to one version per type. The browser `upgradeDocument` action composes `get` + `execute`, so it degrades gracefully.
- Preserving mid-life upgrade history on file import (`filterDomainOperations` strips `document`-scope ops; a mixed v1→v2 history re-imports as flat). Requires interleaved operation upload — separate plan.
- Auth gate (`decide(...)`) for `UPGRADE_DOCUMENT` in `DocumentActionHandler` — flag to the team as a security follow-up.
- Version-aware package auto-discovery on import (discovery currently keys on document type only).

---

### Task 1: Typed `UnsupportedDocumentModelVersionError`

The versioned replay throws a plain `Error` when a document needs a model version that is not installed, so callers cannot distinguish "needs newer package" from "corrupt file". Add a typed error carrying the data the UI needs.

**Files:**
- Modify: `packages/shared/document-model/errors.ts` (append class; `DowngradeNotSupportedError` already lives here)
- Modify: `packages/shared/document-model/versioned-replay.ts:216-224` (throw site)
- Test: `packages/shared/test/unsupported-version-error.test.ts` (create; if `packages/shared` has no vitest config — check for `vitest.config.ts` and a `test` script in its `package.json` — put the test in `packages/document-model/test/document/unsupported-version-error.test.ts` instead, which does run vitest and imports from `@powerhousedao/shared/document-model`)

**Interfaces:**
- Produces: `UnsupportedDocumentModelVersionError` with fields `documentType: string`, `requiredVersion: number`, `availableVersions: number[]`, exported from `@powerhousedao/shared/document-model`. Message text preserves the existing wording so current regex assertions keep passing.

- [ ] **Step 1: Write the failing test**

```typescript
import { UnsupportedDocumentModelVersionError } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";

describe("UnsupportedDocumentModelVersionError", () => {
  it("carries the document type, required version, and available versions", () => {
    const error = new UnsupportedDocumentModelVersionError("test/todo", 2, [1]);
    expect(error.name).toBe("UnsupportedDocumentModelVersionError");
    expect(error.documentType).toBe("test/todo");
    expect(error.requiredVersion).toBe(2);
    expect(error.availableVersions).toEqual([1]);
    expect(error.message).toBe(
      "No reducer registered for document version 2. Available versions: 1",
    );
  });

  it("is detected by the isError guard", () => {
    const error = new UnsupportedDocumentModelVersionError("test/todo", 2, [1]);
    expect(UnsupportedDocumentModelVersionError.isError(error)).toBe(true);
    expect(UnsupportedDocumentModelVersionError.isError(new Error("x"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from the package holding the test): `pnpm vitest run <path-to-test>`
Expected: FAIL — `UnsupportedDocumentModelVersionError` is not exported.

- [ ] **Step 3: Implement the error class**

Append to `packages/shared/document-model/errors.ts`:

```typescript
/**
 * Thrown when replay or import requires a document model version that is not
 * registered. Carries the data the UI needs to explain the mismatch.
 */
export class UnsupportedDocumentModelVersionError extends Error {
  public readonly documentType: string;
  public readonly requiredVersion: number;
  public readonly availableVersions: number[];

  constructor(
    documentType: string,
    requiredVersion: number,
    availableVersions: number[],
  ) {
    super(
      `No reducer registered for document version ${requiredVersion}. Available versions: ${availableVersions.join(", ")}`,
    );
    this.name = "UnsupportedDocumentModelVersionError";
    this.documentType = documentType;
    this.requiredVersion = requiredVersion;
    this.availableVersions = availableVersions;
  }

  static isError(
    error: unknown,
  ): error is UnsupportedDocumentModelVersionError {
    return (
      Error.isError(error) &&
      error.name === "UnsupportedDocumentModelVersionError"
    );
  }
}
```

- [ ] **Step 4: Throw it from versioned replay**

In `packages/shared/document-model/versioned-replay.ts`, the current code around line 216:

```typescript
    const reducer = config.reducers[currentVersion] as unknown as
      | Reducer<TState>
      | undefined;
    if (!reducer) {
      const available = Object.keys(config.reducers).join(", ");
      throw new Error(
        `No reducer registered for document version ${currentVersion}. Available versions: ${available}`,
      );
    }
```

Replace the throw with:

```typescript
    if (!reducer) {
      throw new UnsupportedDocumentModelVersionError(
        header.documentType,
        currentVersion,
        Object.keys(config.reducers).map(Number).sort((a, b) => a - b),
      );
    }
```

Import the class from `./errors.js`. `header` is in scope (the function destructures/loads the document header earlier — check the top of `replayDocumentVersioned`; if the local is named differently, use that variable's `.documentType`).

- [ ] **Step 5: Run the new test and the existing replay suite**

Run: `pnpm tsc --build` in `packages/shared`, then from `packages/document-model`: `pnpm vitest run test/document/versioned-replay.test.ts` and the new test file.
Expected: all PASS (message text unchanged, so existing `/No reducer registered/` assertions still match).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/document-model/errors.ts packages/shared/document-model/versioned-replay.ts <test-file>
git commit -m "feat(shared): typed UnsupportedDocumentModelVersionError for version-aware replay failures"
```

---

### Task 2: Stop erasing document model versions on create/import paths

Three related bugs make most documents lie about their version:
1. `DriveClient.addFile` hardcodes the genesis `toVersion: 1` regardless of the document's actual model version.
2. `ReactorClient.getDocumentModelModule` returns the FIRST module matching the type (registration order), not the latest version.
3. `addDocument` in reactor-browser never stamps `state.document.version` on freshly created documents (unlike `createEmpty`, which does).

**Files:**
- Modify: `packages/reactor/src/client/drive-client.ts:122-128`
- Modify: `packages/reactor/src/client/reactor-client.ts:130-145` (`getDocumentModelModule`)
- Modify: `packages/reactor-browser/src/actions/document.ts:371` (`addDocument`)
- Test: `packages/reactor/test/client/versioning.test.ts` (extend)

**Interfaces:**
- Consumes: `createV2Document()`, `v2Module`, `driveDocumentModelModule`, `client`, `VERSIONED_DOC_TYPE` — all already defined in `versioning.test.ts`.
- Produces: `drives.addFile` preserves `document.state.document.version`; `getDocumentModelModule` returns the highest-versioned module for a type.

- [ ] **Step 1: Write the failing tests**

Append to `packages/reactor/test/client/versioning.test.ts` inside the top-level describe:

```typescript
  describe("version integrity on create paths", () => {
    it("getDocumentModelModule returns the latest module version for a type", async () => {
      const module = await client.getDocumentModelModule(VERSIONED_DOC_TYPE);
      expect(module.version).toBe(2);
    });

    it("drives.addFile preserves the document's model version", async () => {
      const driveDoc = driveDocumentModelModule.utils.createDocument();
      const drive = await client.create(driveDoc);

      const v2Doc = createV2Document();
      const added = await client.drives.addFile(drive.header.id, v2Doc);

      expect(added.state.document.version).toBe(2);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `packages/reactor`: `pnpm vitest run test/client/versioning.test.ts`
Expected: both new tests FAIL — the first because `find()` returns the v1 module (registered first), the second because the genesis stamps `toVersion: 1`.

- [ ] **Step 3: Fix `drive-client.ts`**

In `packages/reactor/src/client/drive-client.ts`, the `upgradeDocumentAction` call inside `addFile` currently reads:

```typescript
        upgradeDocumentAction({
          documentId: document.header.id,
          model: document.header.documentType,
          fromVersion: 0,
          toVersion: 1,
          initialState: document.state,
        }),
```

Change `toVersion: 1,` to:

```typescript
          toVersion: document.state.document.version || 1,
```

- [ ] **Step 4: Fix `getDocumentModelModule` to be latest-wins**

In `packages/reactor/src/client/reactor-client.ts`, replace the body of `getDocumentModelModule`:

```typescript
  async getDocumentModelModule(
    documentType: string,
  ): Promise<DocumentModelModule<any>> {
    const modules = await this.reactor.getDocumentModels();

    let latestModule: DocumentModelModule | undefined;
    let latestVersion = -1;
    for (const module of modules.results) {
      if (module.documentModel.global.id !== documentType) {
        continue;
      }
      const version = module.version ?? 1;
      if (version > latestVersion) {
        latestVersion = version;
        latestModule = module;
      }
    }

    if (!latestModule) {
      throw new Error(
        `Document model module not found for type: ${documentType}`,
      );
    }

    return latestModule as DocumentModelModule<any>;
  }
```

- [ ] **Step 5: Stamp the version in `addDocument` (reactor-browser)**

In `packages/reactor-browser/src/actions/document.ts`, inside `addDocument`, the current code:

```typescript
  // create - use passed document's state if available
  const newDocument = document ?? documentModelModule.utils.createDocument();
```

Add immediately after:

```typescript
  if (!document) {
    newDocument.state.document.version = documentModelModule.version ?? 1;
  }
```

- [ ] **Step 6: Run tests, typecheck**

Run from `packages/reactor`: `pnpm vitest run test/client/versioning.test.ts` — expect all PASS.
Run `pnpm tsc --build` in `packages/reactor` and `packages/reactor-browser`.
Also run the full existing client suite to catch regressions: `pnpm vitest run test/client/`.

- [ ] **Step 7: Commit**

```bash
git add packages/reactor/src/client/drive-client.ts packages/reactor/src/client/reactor-client.ts packages/reactor-browser/src/actions/document.ts packages/reactor/test/client/versioning.test.ts
git commit -m "fix(reactor): preserve document model version on drive addFile and latest-wins module resolution"
```

---

### Task 3: `IReactorClient.upgradeDocument()` trigger API

The upgrade executor exists but nothing can call it. Add the first-class API. The revision snapshot MUST be stamped client-side (`document.header.revision` already has the right per-scope next-index shape).

**Files:**
- Modify: `packages/reactor/src/client/types.ts` (interface, near `createEmpty` at ~line 342)
- Modify: `packages/reactor/src/client/reactor-client.ts` (implementation, place next to `createEmpty`)
- Modify: any other `implements IReactorClient` classes — find them with `grep -rn "implements IReactorClient" packages/ apps/`. For the RPC proxy in `packages/reactor-browser/src/rpc/client-proxy.ts`, implement compositionally (same code shape as below but using `this.get` and `this.execute`, which already round-trip over RPC).
- Test: `packages/reactor/test/client/versioning.test.ts` (extend)

**Interfaces:**
- Produces:
```typescript
upgradeDocument<TDocument extends PHDocument = PHDocument>(
  documentIdentifier: string,
  toVersion?: number,
  signal?: AbortSignal,
): Promise<TDocument>;
```
Omitted `toVersion` upgrades to the latest registered module version. Same-version is a no-op returning the document. Lower target throws `DowngradeNotSupportedError` (from `@powerhousedao/shared/document-model`, constructor `(documentType, fromVersion, toVersion)`).
- Consumes: `upgradeDocumentAction` from `packages/reactor/src/actions/index.ts`; `DowngradeNotSupportedError`.

- [ ] **Step 1: Write the tests**

Append to `packages/reactor/test/client/versioning.test.ts`:

```typescript
  describe("upgradeDocument", () => {
    it("upgrades a v1 document to v2 and applies the upgrade reducer", async () => {
      const doc = await client.createEmpty(VERSIONED_DOC_TYPE, {
        documentModelVersion: 1,
      });
      await client.execute(doc.header.id, "main", [
        v1Actions.addItem({ id: "1", name: "First" }),
      ]);

      const upgraded = await client.upgradeDocument(doc.header.id);

      expect(upgraded.state.document.version).toBe(2);
      const state = upgraded.state as unknown as StateV2;
      expect(state.global.title).toBe("");
      expect(state.global.items[0]).toEqual({
        id: "1",
        name: "First",
        addedAt: "",
      });
    });

    it("applies v2 actions with the v2 reducer after upgrade and keeps migrated state", async () => {
      const doc = await client.createEmpty(VERSIONED_DOC_TYPE, {
        documentModelVersion: 1,
      });
      await client.execute(doc.header.id, "main", [
        v1Actions.addItem({ id: "1", name: "Old" }),
      ]);

      await client.upgradeDocument(doc.header.id);

      await client.execute(doc.header.id, "main", [
        v2Actions.addItem({ id: "2", name: "New" }),
        v2Actions.setTitle({ title: "Upgraded" }),
      ]);

      const retrieved = await client.get(doc.header.id);
      const state = retrieved.state as unknown as StateV2;
      expect(state.global.title).toBe("Upgraded");
      expect(state.global.items.length).toBe(2);
      expect(state.global.items[0]).toHaveProperty("addedAt");
      expect(state.global.items[1].addedAt.length).toBeGreaterThan(0);
    });

    it("no-ops when the document is already at the target version", async () => {
      const doc = await client.createEmpty(VERSIONED_DOC_TYPE, {
        documentModelVersion: 2,
      });
      const result = await client.upgradeDocument(doc.header.id);
      expect(result.state.document.version).toBe(2);
    });

    it("throws DowngradeNotSupportedError when target version is lower", async () => {
      const doc = await client.createEmpty(VERSIONED_DOC_TYPE, {
        documentModelVersion: 2,
      });
      await expect(client.upgradeDocument(doc.header.id, 1)).rejects.toThrow(
        "Downgrade not supported",
      );
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `packages/reactor`: `pnpm vitest run test/client/versioning.test.ts`
Expected: all four FAIL — `upgradeDocument` does not exist.

- [ ] **Step 3: Add the interface method**

In `packages/reactor/src/client/types.ts`, near `createEmpty`:

```typescript
  /**
   * Upgrades a document to a newer document model version by dispatching an
   * UPGRADE_DOCUMENT action. When toVersion is omitted, upgrades to the
   * latest registered module version for the document's type. Returns the
   * document unchanged when it is already at the target version.
   */
  upgradeDocument<TDocument extends PHDocument = PHDocument>(
    documentIdentifier: string,
    toVersion?: number,
    signal?: AbortSignal,
  ): Promise<TDocument>;
```

- [ ] **Step 4: Implement in `ReactorClient`**

Add to `packages/reactor/src/client/reactor-client.ts` (public methods section, after `createEmpty`):

```typescript
  async upgradeDocument<TDocument extends PHDocument = PHDocument>(
    documentIdentifier: string,
    toVersion?: number,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    this.logger.verbose(
      "upgradeDocument(@documentIdentifier, @toVersion)",
      documentIdentifier,
      toVersion,
    );

    const document = await this.reactor.getByIdOrSlug<TDocument>(
      documentIdentifier,
      undefined,
      undefined,
      signal,
    );

    const documentId = document.header.id;
    const documentType = document.header.documentType;
    const fromVersion = document.state.document.version || 1;

    let targetVersion = toVersion;
    if (targetVersion === undefined) {
      const modulesResult = await this.reactor.getDocumentModels(
        undefined,
        undefined,
        signal,
      );
      targetVersion = modulesResult.results
        .filter((m) => m.documentModel.global.id === documentType)
        .reduce((latest, m) => Math.max(latest, m.version ?? 1), 0);
      if (targetVersion === 0) {
        throw new Error(
          `Document model module not found for type: ${documentType}`,
        );
      }
    }

    if (targetVersion === fromVersion) {
      return document;
    }
    if (targetVersion < fromVersion) {
      throw new DowngradeNotSupportedError(
        documentType,
        fromVersion,
        targetVersion,
      );
    }

    const action = upgradeDocumentAction({
      documentId,
      model: documentType,
      fromVersion,
      toVersion: targetVersion,
      revision: { ...document.header.revision },
    });

    return this.execute<TDocument>(
      documentId,
      document.header.branch || "main",
      [action],
      signal,
    );
  }
```

Imports needed: `DowngradeNotSupportedError` from `@powerhousedao/shared/document-model`; `upgradeDocumentAction` from `../actions/index.js` (check whether `reactor-client.ts` already imports from there for `createDocumentAction` — it does; extend that import).

- [ ] **Step 5: Satisfy other implementers**

`pnpm tsc --build` in `packages/reactor`, then in `packages/reactor-browser`. Fix every class that now fails to implement `IReactorClient`. For the RPC client proxy, use the identical algorithm but with `this.get(documentIdentifier, ...)` instead of `this.reactor.getByIdOrSlug`, `this.getDocumentModelModules()` instead of `this.reactor.getDocumentModels()`, and `this.execute(...)` for dispatch. For test doubles/mocks, add a `vi.fn()` or minimal stub consistent with the file's existing style.

- [ ] **Step 6: Run tests**

Run from `packages/reactor`: `pnpm vitest run test/client/versioning.test.ts`
Expected: tests 1, 3, 4 PASS. **Test 2 ("applies v2 actions ... keeps migrated state") is EXPECTED TO FAIL** at this point: the `items[0]` `addedAt` assertion fails because of two cache bugs fixed in Tasks 4 and 5. Do not weaken the test. If it fails on the `title` assertion instead, that is the same root cause.

- [ ] **Step 7: Commit**

```bash
git add packages/reactor/src/client/types.ts packages/reactor/src/client/reactor-client.ts packages/reactor-browser/src/rpc/client-proxy.ts packages/reactor/test/client/versioning.test.ts
git commit -m "feat(reactor): IReactorClient.upgradeDocument with client-side revision stamping"
```

(Include any other implementer files you touched in Step 5.)

---

### Task 4: `executeUpgrade` must read cross-scope-consistent state and invalidate other scopes

**AMENDED during execution.** Task 3 uncovered a third cache bug beyond the one this task originally covered. Both live in `executeUpgrade` and are fixed together here:

1. **Stale read (found in Task 3, causes its test 1 failure):** `executeUpgrade` fetches the document via `writeCache.getState(documentId, "document", ...)`. The write cache keys full-document snapshots per scope stream, and a scope's stream is only refreshed by that scope's own operations — so the `document`-scope snapshot never reflects `global`/`local` operations that ran after document creation. The upgrade reducer therefore migrates stale state and silently drops data.
2. **Stale propagation (original scope of this task, first-order cause of Task 3's test 2 failure):** after the upgrade, `putState` refreshes only the `document` scope stream. Other scopes' cached snapshots keep pre-upgrade, unmigrated state for subsequent actions.

**Files:**
- Modify: `packages/reactor/src/executor/document-action-handler.ts` (inside `executeUpgrade`: after the existing `getState` at ~line 495, and after the `putState` at ~line 600)
- Test: Task 3's integration tests 1 and 2 are the regression tests. Test 1 must pass after this task. Test 2 fully passes only after Task 5.

**Interfaces:**
- Consumes: `stores.writeCache.getState(documentId, scope, branch, targetRevision?, signal)` and `stores.writeCache.invalidate(documentId, scope, branch)` — same calls the executor already uses (see `packages/reactor/src/executor/simple-job-executor.ts:539`).

- [ ] **Step 1: Merge current per-scope state before applying the upgrade**

In `executeUpgrade`, after the existing document fetch (`document = await stores.writeCache.getState(documentId, job.scope, ...)` and its catch block) and before the `isDeleted` check, fetch every other scope's slice and merge its own scope state into the document the upgrade reducer will see. Follow the file's one-await-per-try/catch convention:

```typescript
    const otherScopes = Object.keys(document.state).filter(
      (scope) => scope !== job.scope,
    );
    for (const scope of otherScopes) {
      let scopedDocument: PHDocument;
      try {
        scopedDocument = await stores.writeCache.getState(
          documentId,
          scope,
          job.branch,
          undefined,
          signal,
        );
      } catch (error) {
        return buildErrorResult(
          job,
          new Error(
            `Failed to fetch ${scope} scope for upgrade: ${error instanceof Error ? error.message : String(error)}`,
          ),
          startTime,
        );
      }
      document = {
        ...document,
        state: {
          ...document.state,
          [scope]: (scopedDocument.state as Record<string, unknown>)[scope],
        } as typeof document.state,
      };
    }
```

Adapt the typing to the file's conventions if a cleaner cast is available; the behavior contract is: for every scope key in `document.state` other than `job.scope`, the state the upgrade reducer receives must be that scope's CURRENT state (from its own stream), not the stale copy embedded in the `document`-scope snapshot.

- [ ] **Step 2: Add the post-upgrade invalidation**

Immediately after:

```typescript
    stores.writeCache.putState(
      documentId,
      job.scope,
      job.branch,
      operation.index,
      document,
      SnapshotPosition.Head,
    );
```

add:

```typescript
    for (const scope of otherScopes) {
      stores.writeCache.invalidate(documentId, scope, job.branch);
    }
```

- [ ] **Step 3: Verify behavior shift**

Run from `packages/reactor`: `pnpm vitest run test/client/versioning.test.ts`
Expected: **test 1 ("upgrades a v1 document to v2 and applies the upgrade reducer") now PASSES.** Test 2 still fails: the cold rebuild (forced by the invalidation) applies the upgrade reducer to the initial state instead of the boundary state — confirm the failing assertion is `items[0]` missing `addedAt` / `title` mismatch. Run the executor and cache suites too: `pnpm vitest run test/executor/ test/cache/ test/read-models/` — expect no regressions.

- [ ] **Step 4: Commit**

```bash
git add packages/reactor/src/executor/document-action-handler.ts
git commit -m "fix(reactor): cross-scope-consistent reads and invalidation for UPGRADE_DOCUMENT"
```

---

### Task 5: Cold rebuild must apply upgrade reducers at the boundary

`KyselyWriteCache.coldMissRebuild` applies version-changing upgrade transitions during the document-scope pass — i.e. against the state BEFORE any of the requested scope's operations replay. `replayDocumentVersioned` (the file-load path) gets this right by segmenting. Align the cache: defer version-changing upgrades and apply each one when the scope replay crosses its boundary.

**Files:**
- Modify: `packages/reactor/src/cache/kysely-write-cache.ts` (both document-scope passes ~lines 596-633 and 706-748, the `scope === "document"` early return ~line 763, and the scope replay loop ~lines 844-877)
- Test: `packages/reactor/test/cache/write/versioned-rebuild.test.ts` (extend — reuse the existing `makeVersionedRegistry`, `makeConfig`, and factory helpers already imported there)

**Interfaces:**
- Consumes: existing helpers in the test file: `createTestOperationStore`, `createCreateDocumentOperation`, `createUpgradeDocumentOperation`, `createTestOperation` from `../../factories.js`; `resolveModuleVersionForOp` and `validatedUpgrades` already in the cache implementation.

- [ ] **Step 1: Write the failing test**

Append a new describe to `versioned-rebuild.test.ts`, using the same `beforeEach`/`afterEach` harness as the `D7` describe (copy those blocks):

```typescript
describe("KyselyWriteCache D9 - upgrade reducers run at the boundary", () => {
  let keyframeStore: IKeyframeStore;
  let operationStore: IOperationStore;
  let cache: KyselyWriteCache;
  let db: unknown;

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    operationStore = setup.store;
    keyframeStore = setup.keyframeStore;
    db = setup.db;
  });

  afterEach(async () => {
    await cache?.shutdown();
    try {
      await (db as { destroy: () => Promise<void> }).destroy();
    } catch {
      // ignore
    }
  });

  it("applies the upgrade reducer to boundary state, not initial state", async () => {
    const docId = "d9-boundary-state";

    const v1Reducer = vi.fn().mockImplementation((doc: PHDocument) => {
      const state = doc.state as unknown as { global: { items: string[] } };
      return {
        ...doc,
        state: {
          ...doc.state,
          global: { ...state.global, items: [...state.global.items, "x"] },
        },
      } as PHDocument;
    });
    const v2Reducer = vi.fn().mockImplementation((doc: PHDocument) => doc);

    const upgradeReducer = (doc: PHDocument) => {
      const state = doc.state as unknown as {
        global: { items: string[]; title?: string };
      };
      return {
        ...doc,
        state: {
          ...doc.state,
          global: {
            ...state.global,
            title: `migrated-${state.global.items.length}`,
          },
        },
      } as PHDocument;
    };

    const getModuleFn = vi
      .fn()
      .mockImplementation((_dt: string, version?: number) => ({
        reducer: version === 1 ? v1Reducer : v2Reducer,
      }));
    const computeUpgradePathFn = vi
      .fn()
      .mockReturnValue([{ toVersion: 2, upgradeReducer, description: "" }]);

    const registry = makeVersionedRegistry(getModuleFn, computeUpgradePathFn);
    cache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      makeConfig(),
    );
    await cache.startup();

    const t1 = "2024-01-01T00:00:01.000Z";
    const t2 = "2024-01-01T00:00:02.000Z";
    const t3 = "2024-01-01T00:00:03.000Z";
    const t4 = "2024-01-01T00:00:04.000Z";
    const t5 = "2024-01-01T00:00:05.000Z";

    await operationStore.apply(
      docId,
      DOC_TYPE,
      "document",
      "main",
      0,
      (txn) => {
        txn.addOperations(
          createCreateDocumentOperation(docId, DOC_TYPE, {
            timestampUtcMs: t1,
          }),
        );
        txn.addOperations(
          createUpgradeDocumentOperation(
            docId,
            0,
            1,
            { global: { items: [] }, document: { version: 1 } },
            { index: 1, timestampUtcMs: t2 },
          ),
        );
        txn.addOperations(
          createUpgradeDocumentOperation(
            docId,
            1,
            2,
            {},
            {
              index: 2,
              timestampUtcMs: t4,
              action: {
                id: "upgrade-boundary",
                type: "UPGRADE_DOCUMENT",
                scope: "document",
                timestampUtcMs: t4,
                input: {
                  documentId: docId,
                  fromVersion: 1,
                  toVersion: 2,
                  revision: { global: 1 },
                },
              },
            },
          ),
        );
      },
    );

    await operationStore.apply(docId, DOC_TYPE, "global", "main", 0, (txn) => {
      txn.addOperations(
        createTestOperation(docId, { index: 0, skip: 0, timestampUtcMs: t3 }),
      );
      txn.addOperations(
        createTestOperation(docId, { index: 1, skip: 0, timestampUtcMs: t5 }),
      );
    });

    const result = await cache.getState(docId, "global", "main");
    const state = result.state as unknown as {
      global: { items: string[]; title?: string };
    };

    expect(state.global.title).toBe("migrated-1");
  });
});
```

Note: `createUpgradeDocumentOperation`'s 4th argument seeds `initialState` — check its signature in `test/factories.js` and adjust the genesis call if the initial-state parameter is shaped differently (test 2 of D7 passes `{ document: { version: 2 } }` there, so a partial state object is accepted).

- [ ] **Step 2: Run to verify it fails**

Run from `packages/reactor`: `pnpm vitest run test/cache/write/versioned-rebuild.test.ts`
Expected: new test FAILS with `title` = `"migrated-0"` (upgrade ran against the empty initial state).

- [ ] **Step 3: Restructure `coldMissRebuild`**

The change, in both document-scope passes (keyframe branch and no-keyframe branch):

1. Introduce `const pendingUpgrades: Array<{ action: UpgradeDocumentAction; upgradePath: UpgradeTransition[] | undefined }> = [];` alongside `validatedUpgrades`.
2. Where a **version-changing** upgrade (`fromVersion > 0 && fromVersion < toVersion`) currently calls `applyUpgradeDocumentAction(document, upgradeAction, upgradePath)` immediately, instead push `{ action: upgradeAction, upgradePath }` onto `pendingUpgrades` (keep pushing to `validatedUpgrades` exactly as today — the boundary resolution depends on it). Genesis upgrades (`fromVersion === 0`) keep applying immediately.
3. In the no-keyframe branch, the `docModule` re-resolution after an upgrade (`this.registry.getModule(documentType, extractModuleVersion(document))`) can no longer read the new version from the document (it was not applied); change it to `this.registry.getModule(documentType, upgradeAction.input.toVersion)`.
4. In the `scope === "document"` early-return block, drain all pending upgrades first:

```typescript
    for (const pending of pendingUpgrades) {
      document = applyUpgradeDocumentAction(
        document,
        pending.action,
        pending.upgradePath,
      );
    }
```

5. Compute the final version once, before the scope replay loop, and use it as the `finalVersion` argument instead of `extractModuleVersion(document)` (which is now stale until upgrades apply):

```typescript
    const finalVersion =
      validatedUpgrades.at(-1)?.toVersion ?? extractModuleVersion(document);
```

6. In the scope replay loop, after computing `moduleVersion` for the operation and before applying it, drain every pending upgrade whose `toVersion` is at or below the operation's resolved version:

```typescript
          while (
            pendingUpgrades.length > 0 &&
            (moduleVersion ?? Number.MAX_SAFE_INTEGER) >=
              pendingUpgrades[0].action.input.toVersion
          ) {
            const pending = pendingUpgrades.shift();
            if (pending) {
              document = applyUpgradeDocumentAction(
                document,
                pending.action,
                pending.upgradePath,
              );
            }
          }
```

7. After the paging `do...while` loop completes, drain any remaining `pendingUpgrades` the same way (upgrades whose boundary lies beyond the last operation still must apply to reach the final state).

- [ ] **Step 4: Run the cache suites and the client integration test**

From `packages/reactor`:
- `pnpm vitest run test/cache/write/versioned-rebuild.test.ts` — D9 passes, D7/D8 unchanged.
- `pnpm vitest run test/cache/` — no regressions.
- `pnpm vitest run test/client/versioning.test.ts` — **Task 3's test 2 now passes.** This is the acceptance gate for Tasks 3-5 together.

- [ ] **Step 5: Commit**

```bash
git add packages/reactor/src/cache/kysely-write-cache.ts packages/reactor/test/cache/write/versioned-rebuild.test.ts
git commit -m "fix(reactor): apply upgrade reducers at the version boundary during cold rebuild"
```

---

### Task 6: Export `upgradeManifests` from the Vetra package

Connect already collects `pkg.upgradeManifests` from every loaded package (`apps/connect/src/store/reactor.ts:307-316`) and registers them — but `packages/vetra/index.ts` never exports them, even though `packages/vetra/document-models/upgrade-manifests.ts` exists. (`packages/powerhouse-vetra-packages` has no aggregate manifest file and all its models are v1-only — leave it; codegen-generated user packages already export theirs.)

**Files:**
- Modify: `packages/vetra/index.ts`

- [ ] **Step 1: Add the export**

`packages/vetra/index.ts` currently:

```typescript
import type { Manifest } from "@powerhousedao/shared/document-model";
import manifestJson from "./powerhouse.manifest.json" with { type: "json" };
export { documentModels } from "./document-models/document-models.js";
export { editors } from "./editors/editors.js";
export const manifest: Manifest = manifestJson;
```

Add after the `documentModels` export:

```typescript
export { upgradeManifests } from "./document-models/upgrade-manifests.js";
```

- [ ] **Step 2: Verify and commit**

Run `pnpm tsc --build` in `packages/vetra`. Expected: clean.

```bash
git add packages/vetra/index.ts
git commit -m "fix(vetra): export upgradeManifests so Connect can register them"
```

---

### Task 7: reactor-browser `upgradeDocument` action + `useDocumentVersionStatus` hook

Give the UI layer (Connect + design-system) one action to trigger an upgrade and one hook to classify any open document as current / upgrade-available / unsupported.

**Files:**
- Modify: `packages/reactor-browser/src/actions/document.ts` (append action)
- Modify: `packages/reactor-browser/src/actions/index.ts` (named export)
- Create: `packages/reactor-browser/src/hooks/document-version-status.ts`
- Modify: `packages/reactor-browser/src/hooks/index.ts` (add `export * from "./document-version-status.js";`)
- Test: `packages/reactor-browser/test/document-version-status.test.ts` (create; check `packages/reactor-browser/package.json` for a vitest `test` script — if the package has no test runner, place the test in `packages/reactor/test/registry/document-version-status.test.ts` importing the pure function via relative path is NOT possible cross-package, so instead fall back to `pnpm tsc --build` verification and note it in the commit message)

**Interfaces:**
- Produces:

```typescript
export type DocumentVersionStatus =
  | { kind: "current"; documentVersion: number }
  | {
      kind: "upgrade-available";
      documentVersion: number;
      latestVersion: number;
      canUpgrade: boolean;
    }
  | {
      kind: "unsupported";
      documentVersion: number;
      availableVersions: number[];
    };

export function getDocumentVersionStatus(
  documentVersion: number,
  availableVersions: number[],
  hasUpgradePath: (fromVersion: number, toVersion: number) => boolean,
): DocumentVersionStatus | undefined;

export function useDocumentVersionStatus(
  document: PHDocument | undefined,
): DocumentVersionStatus | undefined;

export async function upgradeDocument(
  documentId: string,
  toVersion?: number,
): Promise<PHDocument>;
```

- Consumes: `useDocumentModelModules` (`./document-model-modules.js`), `useModelRegistry` (`./reactor.js`), `IReactorClient.upgradeDocument` from Task 3.

- [ ] **Step 1: Write the pure-function test**

```typescript
import { describe, expect, it } from "vitest";
import { getDocumentVersionStatus } from "../src/hooks/document-version-status.js";

const pathAlways = () => true;
const pathNever = () => false;

describe("getDocumentVersionStatus", () => {
  it("returns current when the document is at the latest installed version", () => {
    expect(getDocumentVersionStatus(2, [1, 2], pathAlways)).toEqual({
      kind: "current",
      documentVersion: 2,
    });
  });

  it("returns upgrade-available when a newer version is installed", () => {
    expect(getDocumentVersionStatus(1, [1, 2], pathAlways)).toEqual({
      kind: "upgrade-available",
      documentVersion: 1,
      latestVersion: 2,
      canUpgrade: true,
    });
  });

  it("reports canUpgrade false when no upgrade path exists", () => {
    expect(getDocumentVersionStatus(1, [1, 2], pathNever)).toEqual({
      kind: "upgrade-available",
      documentVersion: 1,
      latestVersion: 2,
      canUpgrade: false,
    });
  });

  it("returns unsupported when the document is newer than anything installed", () => {
    expect(getDocumentVersionStatus(3, [1, 2], pathAlways)).toEqual({
      kind: "unsupported",
      documentVersion: 3,
      availableVersions: [1, 2],
    });
  });

  it("returns undefined when no versions are installed", () => {
    expect(getDocumentVersionStatus(1, [], pathAlways)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement the hook file**

Create `packages/reactor-browser/src/hooks/document-version-status.ts`:

```typescript
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { useDocumentModelModules } from "./document-model-modules.js";
import { useModelRegistry } from "./reactor.js";

export type DocumentVersionStatus =
  | { kind: "current"; documentVersion: number }
  | {
      kind: "upgrade-available";
      documentVersion: number;
      latestVersion: number;
      canUpgrade: boolean;
    }
  | {
      kind: "unsupported";
      documentVersion: number;
      availableVersions: number[];
    };

/**
 * Classifies a document's model version against the installed module
 * versions. Pure logic, extracted for testing.
 */
export function getDocumentVersionStatus(
  documentVersion: number,
  availableVersions: number[],
  hasUpgradePath: (fromVersion: number, toVersion: number) => boolean,
): DocumentVersionStatus | undefined {
  if (availableVersions.length === 0) {
    return undefined;
  }
  const sorted = [...availableVersions].sort((a, b) => a - b);
  const latestVersion = sorted[sorted.length - 1];
  if (documentVersion > latestVersion) {
    return { kind: "unsupported", documentVersion, availableVersions: sorted };
  }
  if (documentVersion === latestVersion) {
    return { kind: "current", documentVersion };
  }
  return {
    kind: "upgrade-available",
    documentVersion,
    latestVersion,
    canUpgrade: hasUpgradePath(documentVersion, latestVersion),
  };
}

/**
 * Compares the given document's model version against the versions available
 * from installed Vetra packages. Returns undefined while packages load or
 * when the document type has no installed modules.
 */
export function useDocumentVersionStatus(
  document: PHDocument | undefined,
): DocumentVersionStatus | undefined {
  const modules = useDocumentModelModules();
  const registry = useModelRegistry();
  if (!document || !modules) {
    return undefined;
  }
  const documentType = document.header.documentType;
  const documentVersion = document.state.document.version || 1;
  const availableVersions = modules
    .filter((m) => m.documentModel.global.id === documentType)
    .map((m) => m.version ?? 1);

  return getDocumentVersionStatus(
    documentVersion,
    availableVersions,
    (fromVersion, toVersion) => {
      if (!registry) {
        return false;
      }
      try {
        registry.computeUpgradePath(documentType, fromVersion, toVersion);
        return true;
      } catch {
        return false;
      }
    },
  );
}
```

Check the exact name/location of `useModelRegistry` in `packages/reactor-browser/src/hooks/reactor.ts` (it is defined there returning `useReactorClientModule()?.reactorModule?.documentModelRegistry`).

- [ ] **Step 3: Add the browser action**

Append to `packages/reactor-browser/src/actions/document.ts`:

```typescript
/**
 * Upgrades a document to a newer document model version. Defaults to the
 * latest registered version for the document's type.
 */
export async function upgradeDocument(documentId: string, toVersion?: number) {
  const reactorClient = window.ph?.reactorClientModule?.client;
  if (!reactorClient) {
    throw new Error("ReactorClient not initialized");
  }
  return reactorClient.upgradeDocument(documentId, toVersion);
}
```

Add `upgradeDocument` to the named export block for `./document.js` in `packages/reactor-browser/src/actions/index.ts`, and add `export * from "./document-version-status.js";` to `packages/reactor-browser/src/hooks/index.ts`.

- [ ] **Step 4: Run test and typecheck**

From `packages/reactor-browser`: `pnpm vitest run test/document-version-status.test.ts` (or fallback per Files note), then `pnpm tsc --build`.
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/reactor-browser/src/hooks/document-version-status.ts packages/reactor-browser/src/hooks/index.ts packages/reactor-browser/src/actions/document.ts packages/reactor-browser/src/actions/index.ts packages/reactor-browser/test/document-version-status.test.ts
git commit -m "feat(reactor-browser): upgradeDocument action and useDocumentVersionStatus hook"
```

---

### Task 8: "Update" button in the document toolbar (design-system)

`DocumentToolbar` is rendered by every compliant editor, so a new built-in control reaches all editors at once. The button self-hides unless an upgrade is available and executable.

**Files:**
- Modify: `packages/design-system/src/connect/components/document-toolbar/toolbar-button.tsx` (append component; it already imports from `@powerhousedao/reactor-browser`)
- Modify: `packages/design-system/src/connect/components/document-toolbar/constants.ts` (slot + component map)

**Interfaces:**
- Consumes: `useDocumentVersionStatus`, `upgradeDocument` from `@powerhousedao/reactor-browser` (Task 7); `ToolbarButton`, `ToolbarButtonProps`, `makeOnClick` already in `toolbar-button.tsx`.
- Produces: built-in control name `"update"` (extends `DocumentToolbarControlName` automatically via the `documentToolbarControls` derivation in `types.ts`).

- [ ] **Step 1: Add `ToolbarUpgradeButton`**

Append to `toolbar-button.tsx` (match the style of `ToolbarDownloadButton`; `makeOnClick` is the file's local helper — check its exact signature at the bottom of the file):

```tsx
/**
 * Toolbar control for upgrading the document to the latest installed
 * document model version. Renders nothing when the document is already
 * current or no upgrade path is registered.
 */
export function ToolbarUpgradeButton(props: ToolbarButtonProps) {
  const { className, onClick: onClickOverride, document, children } = props;
  const versionStatus = useDocumentVersionStatus(document);

  const runUpgrade = () => {
    if (document) {
      void upgradeDocument(document.header.id);
    }
  };
  const onClick = makeOnClick(document, onClickOverride, runUpgrade);

  if (
    !versionStatus ||
    versionStatus.kind !== "upgrade-available" ||
    !versionStatus.canUpgrade
  ) {
    return null;
  }

  return (
    <ToolbarButton
      data-testid="toolbar-upgrade-button"
      aria-label="Update document"
      className={className}
      onClick={onClick}
    >
      {children ?? <span className="px-1 text-xs">Update available</span>}
    </ToolbarButton>
  );
}
```

Add `useDocumentVersionStatus` and `upgradeDocument` to the existing `@powerhousedao/reactor-browser` import at the top of the file. Keep all hook calls before the early return (React rules of hooks).

- [ ] **Step 2: Register the control**

In `constants.ts`:

```typescript
export const defaultControlSlots = {
  first: ["undo", "redo", "download"],
  second: ["name"],
  third: ["update", "history", "switchboard", "close"],
} as const;
```

and add `update: ToolbarUpgradeButton,` to `defaultControlComponents` (import `ToolbarUpgradeButton` alongside the other buttons).

- [ ] **Step 3: Typecheck and test**

`pnpm tsc --build` in `packages/design-system`. If the package has a vitest suite covering the toolbar (check `packages/design-system` for `*.test.tsx` near the component), run it: `pnpm vitest run src/connect/components/document-toolbar`. Expected: clean/PASS — existing snapshots may need updating if they enumerate default controls; regenerate only after confirming the diff is the new `update` entry.

- [ ] **Step 4: Commit**

```bash
git add packages/design-system/src/connect/components/document-toolbar/toolbar-button.tsx packages/design-system/src/connect/components/document-toolbar/constants.ts
git commit -m "feat(design-system): built-in Update control in DocumentToolbar"
```

---

### Task 9: Toast when opening an outdated document (Connect)

Mirror the existing outdated-app pattern (`useCheckLatestVersion` + `ReloadConnectToast`): persistent warning toast with an inline action, deduplicated per document by `toastId`.

**Files:**
- Create: `apps/connect/src/components/document-upgrade-toast.tsx`
- Modify: `apps/connect/src/components/editors.tsx` (inside `DocumentEditor`)
- Modify: `apps/connect/src/i18n/locales/en.json` (two keys)

**Interfaces:**
- Consumes: `toast` from `@powerhousedao/connect/services`; `useDocumentVersionStatus`, `upgradeDocument` from `@powerhousedao/reactor-browser`.

- [ ] **Step 1: Add i18n keys**

In `en.json`, next to the existing `notifications.reloadApp` key, add:

```json
"documentUpgradeAvailable": "A newer version of this document type is installed."
```

and next to the `common.reloadConnect` key add:

```json
"updateDocument": "Update document"
```

(Match the file's existing nesting — `notifications` and `common` are objects; add the keys inside them.)

- [ ] **Step 2: Create the toast component**

`apps/connect/src/components/document-upgrade-toast.tsx`:

```tsx
import { upgradeDocument } from "@powerhousedao/reactor-browser";
import { useTranslation } from "react-i18next";

export const DocumentUpgradeToast = ({
  documentId,
}: {
  documentId: string;
}) => {
  const { t } = useTranslation();

  return (
    <div>
      <p className="font-medium">{t("notifications.documentUpgradeAvailable")}</p>
      <button
        onClick={() => void upgradeDocument(documentId)}
        className="underline decoration-solid underline-offset-2"
      >
        {t("common.updateDocument")}
      </button>
    </div>
  );
};
```

- [ ] **Step 3: Fire it from `DocumentEditor`**

In `apps/connect/src/components/editors.tsx`, after the `const editorModule = ...` line (~line 64), add:

```typescript
  const versionStatus = useDocumentVersionStatus(document ?? undefined);
  useEffect(() => {
    if (
      versionStatus?.kind === "upgrade-available" &&
      versionStatus.canUpgrade &&
      documentId
    ) {
      toast(createElement(DocumentUpgradeToast, { documentId }), {
        type: "connect-warning",
        toastId: `outdated-document-${documentId}`,
        autoClose: false,
      });
    }
  }, [versionStatus, documentId]);
```

Imports to add: `useDocumentVersionStatus` in the existing `@powerhousedao/reactor-browser` import block; `createElement` in the `react` import; `DocumentUpgradeToast` from `./document-upgrade-toast.js`. `toast` is already imported from `@powerhousedao/connect/services`.

- [ ] **Step 4: Typecheck and verify**

From `apps/connect`: `pnpm tsc` (check the package's script name — `tsc` or `typecheck`). Expected: clean. Behavioral verification happens in Task 12.

- [ ] **Step 5: Commit**

```bash
git add apps/connect/src/components/document-upgrade-toast.tsx apps/connect/src/components/editors.tsx apps/connect/src/i18n/locales/en.json
git commit -m "feat(connect): warning toast with update action when an outdated document is opened"
```

---

### Task 10: Unsupported-version modal + import error wiring (Connect)

When an imported file needs a NEWER model version than installed (the Invoice scenario), the user currently sees a raw error string (drag-and-drop) or an unexplained "invalid" row (file picker). Show a modal that explains the mismatch and points at the package manager.

**Files:**
- Modify: `packages/reactor-browser/src/types/modals.ts` (new variant)
- Create: `apps/connect/src/components/modal/modals/DocumentVersionUnsupportedModal.tsx`
- Modify: `apps/connect/src/components/modal/modals-container.tsx` (lazy import + map entry)
- Modify: `packages/reactor-browser/src/actions/document.ts` (`addFileWithProgress` catch branch)
- Modify: `apps/connect/src/components/modal/modals/OpenFileDocumentsModal.tsx` (`parsePendingFile`)
- Modify: `apps/connect/src/utils/open-file-plan.ts` (`ParsedFileInfo` union)

**Interfaces:**
- Produces: modal variant `{ type: "documentVersionUnsupported"; documentType: string; requiredVersion: number; availableVersions: number[] }`; `ParsedFileInfo` state `{ state: "version-unsupported"; documentType: string; requiredVersion: number }`.
- Consumes: `UnsupportedDocumentModelVersionError` (Task 1), `showPHModal`/`usePHModal`/`closePHModal` from `@powerhousedao/reactor-browser`.

- [ ] **Step 1: Add the modal variant**

In `packages/reactor-browser/src/types/modals.ts`, add to the `PHModal` union after the `missingPackage` variant:

```typescript
  | {
      type: "documentVersionUnsupported";
      documentType: string;
      requiredVersion: number;
      availableVersions: number[];
    }
```

Run `pnpm tsc --build` in `packages/reactor-browser`.

- [ ] **Step 2: Create the modal component**

Open `apps/connect/src/components/modal/modals/DownloadDocumentWithErrorsModal.tsx` and copy its chrome (whatever dialog primitive and layout it uses — it is the repo's canonical simple info modal reading `usePHModal`). Create `DocumentVersionUnsupportedModal.tsx` with this behavior:

```tsx
import {
  closePHModal,
  showPHModal,
  usePHModal,
} from "@powerhousedao/reactor-browser";

export function DocumentVersionUnsupportedModal() {
  const phModal = usePHModal();
  const open = phModal?.type === "documentVersionUnsupported";
  if (!open) return null;

  const { documentType, requiredVersion, availableVersions } = phModal;

  // Render inside the same dialog primitive DownloadDocumentWithErrorsModal
  // uses, with:
  // - title: "Document version not supported"
  // - body: `This document was created with version ${requiredVersion} of
  //   "${documentType}", but this Connect instance only has version${
  //   availableVersions.length > 1 ? "s" : ""} ${availableVersions.join(", ")}
  //   installed. Update the package that provides "${documentType}" to open
  //   this document.`
  // - primary button: "Open package manager" ->
  //   { closePHModal(); showPHModal({ type: "settings" }); }
  // - secondary button: "Close" -> closePHModal()
}
```

The comment block describes the required copy and actions — implement them with the borrowed dialog primitive, then delete the comment.

- [ ] **Step 3: Register in the modals container**

In `apps/connect/src/components/modal/modals-container.tsx`, following the exact pattern of the existing entries (e.g. `DownloadDocumentWithErrorsModal` at lines 50-52 and its `modalComponents` entry):

```typescript
const DocumentVersionUnsupportedModal = lazy(() =>
  import("./modals/DocumentVersionUnsupportedModal.js").then((m) => ({
    default: m.DocumentVersionUnsupportedModal,
  })),
);
```

and add `documentVersionUnsupported: DocumentVersionUnsupportedModal,` to the `modalComponents` map.

- [ ] **Step 4: Wire the drag-and-drop import path**

In `packages/reactor-browser/src/actions/document.ts`, inside `addFileWithProgress`'s `catch (loadError)` block, BEFORE the existing `DocumentModelNotFoundError` discovery branch, add:

```typescript
      if (UnsupportedDocumentModelVersionError.isError(loadError)) {
        showPHModal({
          type: "documentVersionUnsupported",
          documentType: loadError.documentType,
          requiredVersion: loadError.requiredVersion,
          availableVersions: loadError.availableVersions,
        });
        onProgress?.({
          stage: "failed",
          progress: 100,
          error: loadError.message,
        });
        return;
      }
```

Imports: `UnsupportedDocumentModelVersionError` from `@powerhousedao/shared/document-model`; `showPHModal` from `../hooks/modals.js` (check the relative path other action files use to import it — `packages/reactor-browser/src/utils/download-document.ts` already calls `showPHModal` from an actions-adjacent context; mirror its import).

- [ ] **Step 5: Wire the file-picker path**

In `apps/connect/src/utils/open-file-plan.ts`, extend `ParsedFileInfo`:

```typescript
  // The file needs a newer document model version than any installed module.
  | {
      state: "version-unsupported";
      documentType: string;
      requiredVersion: number;
    }
```

In `OpenFileDocumentsModal.tsx`'s `parsePendingFile`, before the `DocumentModelNotFoundError` check:

```typescript
    if (UnsupportedDocumentModelVersionError.isError(error)) {
      return {
        state: "version-unsupported",
        documentType: error.documentType,
        requiredVersion: error.requiredVersion,
      };
    }
```

Then `grep -n '"invalid"' apps/connect/src/utils/open-file-plan.ts apps/connect/src/components/modal/modals/OpenFileDocumentsModal.tsx` and handle `"version-unsupported"` everywhere `"invalid"` is handled: same non-importable treatment, but display the message `Requires version {requiredVersion} of {documentType} — update the package` instead of the generic invalid copy (follow however the invalid row renders its label; hardcoded English is consistent with that file).

- [ ] **Step 6: Typecheck everything and commit**

`pnpm tsc --build` in `packages/reactor-browser`, then `pnpm tsc` in `apps/connect`. Expected: clean. (The exhaustive `modalComponents` map and `ParsedFileInfo` switch will surface any spot you missed.)

```bash
git add packages/reactor-browser/src/types/modals.ts packages/reactor-browser/src/actions/document.ts apps/connect/src/components/modal/modals/DocumentVersionUnsupportedModal.tsx apps/connect/src/components/modal/modals-container.tsx apps/connect/src/components/modal/modals/OpenFileDocumentsModal.tsx apps/connect/src/utils/open-file-plan.ts
git commit -m "feat(connect): documentVersionUnsupported modal wired into both import paths"
```

---

### Task 11: Editor host gate for unsupported documents

A document synced from a remote drive with a newer model version currently opens with the latest editor and silently fails on writes. Block it with an explanatory screen instead.

**Files:**
- Modify: `apps/connect/src/components/editors.tsx`

**Interfaces:**
- Consumes: `versionStatus` (already computed in Task 9's edit), `EditorError` (local component), `showPHModal`.

- [ ] **Step 1: Add the gate**

In `DocumentEditor`, after the existing `if (!documentModelModule) { ... }` block and before `if (!editorModule)`, add:

```tsx
  if (versionStatus?.kind === "unsupported") {
    return (
      <EditorError
        message={
          <div className="text-center leading-10">
            <p>
              This document requires version {versionStatus.documentVersion} of
              the "{documentType}" document model, but only version
              {versionStatus.availableVersions.length > 1 ? "s" : ""}{" "}
              {versionStatus.availableVersions.join(", ")}{" "}
              {versionStatus.availableVersions.length > 1 ? "are" : "is"}{" "}
              installed.
            </p>
            <p>
              Go to the{" "}
              <button
                type="button"
                className="cursor-pointer underline"
                onClick={() => {
                  showPHModal({ type: "settings" });
                }}
              >
                package manager
              </button>{" "}
              to update the package that provides "{documentType}"
            </p>
          </div>
        }
      />
    );
  }
```

- [ ] **Step 2: Typecheck and commit**

`pnpm tsc` in `apps/connect`. Expected: clean.

```bash
git add apps/connect/src/components/editors.tsx
git commit -m "feat(connect): block editors for documents newer than installed model versions"
```

---

### Task 12: End-to-end manual verification

Use the existing `test/versioned-documents` project — it ships the 2-version `test/todo` model with a real v1→v2 upgrade manifest (adds `title` to global state) and an editor. No new document model is needed.

**Files:** none created (verification only). Record results in the PR description.

- [ ] **Step 1: Build the changed packages and launch Connect studio**

```bash
pnpm tsc --build   # from repo root, or build the changed packages individually
cd test/versioned-documents
pnpm connect
```

- [ ] **Step 2: Upgrade-available flow (Case A)**

1. In the browser console, create a v1 document:
   `await window.ph.reactorClientModule.client.createEmpty("test/todo", { documentModelVersion: 1 })`
2. Refresh the drive view, open the document.
3. Expected: the warning toast "A newer version of this document type is installed." appears with an "Update document" action, and the toolbar shows "Update available" at the start of the right-hand control group.
4. Add a todo item, then click Update (either control).
5. Expected: no errors; in console, `(await window.ph.reactorClient.get("<docId>")).state.document.version` is `2` and `state.global.title` is `""`. The toast/button no longer show on reopen.
6. Add another todo after the upgrade and reload the page — the document still opens with both items (exercises the Task 5 cold-rebuild path against real storage).

- [ ] **Step 3: Unsupported-version flow (Case B)**

1. Export a v2 document: open a v2 document and use the toolbar Download button (produces a `.phd`).
2. Simulate a legacy Connect: in `test/versioned-documents/document-models/todo/index.ts` (or wherever `document-models.ts` aggregates the versions — find with `grep -rn "TodoV2\|v2/module" test/versioned-documents/document-models/document-models.ts`), temporarily remove the v2 module from the exported `documentModels` array. Restart `pnpm connect`.
3. Drag the exported `.phd` into a drive.
4. Expected: the "Document version not supported" modal appears naming `test/todo`, required version 2, installed version 1; the upload row shows failed, not a silent success.
5. Also open the modal flow via the OS-file path if practical (double-click the file with the PWA installed) — the picker row should show the version-unsupported message.
6. Revert the temporary edit.

- [ ] **Step 4: Regression sweep**

From the repo root run the suites touched by this plan:

```bash
cd packages/reactor && pnpm vitest run test/client/ test/cache/ test/executor/ test/registry/
cd ../../packages/document-model && pnpm vitest run test/document/versioned-replay.test.ts
cd ../../test/versioned-documents && pnpm test
```

Expected: all PASS.

- [ ] **Step 5: Final commit / PR**

```bash
git add -A
git commit -m "docs(plan): record manual verification results for document upgrades"
```

Open the PR against `main` from `fix-connect-document-upgrades`, summarizing: version-integrity fixes, `upgradeDocument` API, cache correctness fixes, and the three UX surfaces, with the out-of-scope follow-ups listed.
