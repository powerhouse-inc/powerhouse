# Document Model Editor Versioning — Design

**Date:** 2026-08-05
**Status:** Approved by user (pending spec review)
**Related:** `docs/superpowers/plans/2026-08-03-connect-document-model-upgrades.md` (the Connect-side upgrade UX this feature feeds)

## Problem

The `powerhouse/document-model` document type supports multiple specification
versions: `RELEASE_NEW_VERSION` freezes the latest spec by deep-copying it as
version N+1, and every subsequent edit operation targets the last spec. The
Connect upgrade flow (toast → toolbar button → confirmation modal → migration)
consumes these versions. But the document model editor exposes none of it:

1. **No version display** — a publisher cannot see which version they are
   editing.
2. **No release action** — `releaseNewVersion` is exported from
   `@powerhousedao/shared/document-model` but referenced by zero UI code; the
   only way to release is dispatching the action via reactor-mcp.
3. **Latent display bug** — `editor.tsx` renders
   `document.state.global.specifications[0]` (first spec) while all reducers
   write to `specifications[length - 1]` (last spec). The editor only works
   today because models have exactly one spec. After a release, the editor
   would show v1 while edits silently land in v2.
4. **No guidance** — a publisher editing a model that is already in production
   has no signal that a breaking change should go into a new version instead.

Nothing in the model document records whether a version has shipped, so the
editor cannot know mechanically whether v1 is in production. The design asks
the one party who knows — the user — once, at the moment it matters.

## Decisions (user-approved)

| Question | Decision |
| --- | --- |
| Guard style for breaking changes | **Advisory dialog** on first version-relevant edit; user chooses "release first" or "keep editing"; choice remembered per document + version for the browser session |
| Placement of version UI | **Metadata header** — badge + release button next to the model identity fields |
| Older versions | **Read-only switcher** — dropdown to view frozen specs; only the latest spec is editable |

## Design

### 1. Foundation fix: edit the latest spec

`editor.tsx` switches its working spec from `specifications[0]` to the last
element (`specifications[specifications.length - 1]`), named `latestSpec`.
Safe for all existing single-spec models (last === first). All existing
handlers continue to operate on the working spec.

### 2. Version UI in the metadata header

Rendered in/next to the `ModelMetadata` section:

- **Version badge** — "Version N" (from `latestSpec.version`), always visible,
  including single-spec models. Visibility before versions matter is the
  transparency mechanism.
- **Version switcher** — only rendered when `specifications.length >= 2`.
  A dropdown listing v1…vN. Selecting an older version renders that spec's
  metadata/schemas/modules wrapped in a read-only overlay
  (`pointer-events-none` wrapper + banner: "Version 1 is frozen. You're
  viewing it read-only. Edits go to version N."). Selecting the latest
  version returns to normal editing. Read-only via wrapper, not per-component
  `disabled` props — cheap and refinable later.
- **"Release new version" button** — opens a confirmation modal:
  - Copy: "Version N will be frozen as-is. Version N+1 starts as an identical
    copy, and all further edits apply to version N+1. Existing version N
    documents will be upgradeable once you define the migration."
  - Confirm dispatches `releaseNewVersion()` (empty input). Cancel closes.
  - On dispatch error: warning toast, no state change.

### 3. Breaking-change classification

New pure util `classifyDocumentModelAction(action, latestSpec, previousSpec?)`
returning `"version-relevant" | "safe"`.

**Version-relevant (advisory fires):**

- `SET_STATE_SCHEMA` (global or local) — only when the **state shape**
  changes. The classifier parses old and new SDL with the graphql parser
  already used by this package and diffs field-by-field per type:
  - **added field** → shape change
  - **removed field** → shape change
  - **field type change** (including nullability change) → shape change
  - **rename** → surfaces as a remove + add pair (indistinguishable from
    remove+add at the SDL level) → shape change
  - Reordering fields, doc-comments/descriptions, whitespace → **safe**.
  The advisory dialog lists the concrete field diff (`− title`, `+ name`,
  `~ amount: Int → Float`) in the same badge style as the Connect upgrade
  confirmation modal.
- `SET_INITIAL_STATE` — changes the replay baseline for existing documents.
- `DELETE_OPERATION`, `DELETE_MODULE` — removes replay targets.
- `SET_OPERATION_NAME` — renames break replay (operation type strings derive
  from names).
- `SET_OPERATION_SCHEMA` — only for operations that already existed in the
  previous released spec (by operation id, when `previousSpec` exists). For a
  single-spec model, all existing operations count.

**Safe (never interrupts):**

- Model name, description, extension, author name/website.
- `ADD_MODULE`, `ADD_OPERATION` (additive).
- `SET_MODULE_NAME`, operation descriptions, operation error add/delete/rename.
- `SET_OPERATION_SCHEMA` on an operation added since the last release.

`SET_MODEL_ID` (changing the document type string) is out of scope: releasing
a new version does not mitigate an identity change, so the advisory would be
misleading. No special handling in this feature.

### 4. Advisory dialog + session memory

New hook `useVersionAdvisory(document)` wraps dispatch:

1. Handler calls `guardedDispatch(action)`.
2. Classifier runs. Safe actions dispatch immediately.
3. Version-relevant action + no remembered choice for
   `(documentId, latestSpec.version)` → advisory dialog opens with the action
   held pending:
   - Title: "Is version N of this model already in use?"
   - Body: explains the change affects documents created with version N, and
     shows the concrete diff (field badges for schema changes, operation name
     for deletions/renames).
   - **"It's in use — release version N+1 first"** → dispatches
     `releaseNewVersion()`, then the pending action (which the reducers apply
     to the new latest spec). The user's edit is never lost.
   - **"Still in development — keep editing version N"** → dispatches the
     pending action to version N; remembers the choice.
4. Remembered choice is stored **in memory, per document + version, per
   browser session** (module-level Map, not localStorage). Rationale: a
   publisher returning after shipping v1 is asked again exactly when the
   reminder matters; someone iterating on a schema is asked once per session.
5. After a release (via button or advisory), the new version has no remembered
   choice — but the first version-relevant edit right after an explicit
   release should not re-ask; releasing marks the fresh version as
   "in development" for the session.

### 5. Component/file layout

All inside `packages/powerhouse-vetra-packages/editors/document-model-editor/`:

- `components/version-controls.tsx` — badge, switcher, release button,
  release-confirmation modal, frozen-version banner.
- `components/version-advisory-modal.tsx` — the advisory dialog (field-diff
  badges reuse the compact style of Connect's upgrade modal; modal built from
  the design-system `Modal` + `ModalButton` primitives, matching
  `ConfirmDocumentUpgradeModal`).
- `utils/change-classification.ts` — pure classifier + SDL shape diff.
- `hooks/useVersionAdvisory.ts` — session memory + intercept-then-dispatch.
- `editor.tsx` — latest-spec selection, `viewedVersion` state, handlers routed
  through the advisory hook, version controls rendered in the metadata header
  area.

Downstream is untouched: codegen already handles multi-spec models (emits
`vN/` folders, `upgrades/versions.ts`, `upgrades/vN.ts` stub), and the Connect
upgrade UX consumes the result.

### 6. Testing

- **Unit (vitest, colocated like `helpers.test.ts`):**
  - Classifier: add/remove/retype/rename field → version-relevant; reorder,
    description, whitespace edits → safe; each operation-level action type;
    `SET_OPERATION_SCHEMA` new-vs-preexisting operation with and without a
    previous spec.
  - Advisory hook: safe action passes through; version-relevant action holds
    pending; "release first" dispatches release then pending action;
    "keep editing" dispatches pending action and suppresses subsequent
    dialogs for that version; explicit release suppresses the advisory for
    the new version.
- **Headless probe (Playwright, scratchpad script against the running vetra
  drive):** open a model, verify badge shows v1; make a shape-changing schema
  edit; advisory appears; choose "release v2 first"; verify badge shows v2,
  switcher lists v1 read-only, and the schema edit landed in v2.

### 7. Error handling

- `releaseNewVersion` dispatch failure → warning toast; pending action is not
  dispatched; dialog closes.
- Frozen-spec views cannot dispatch by construction (read-only overlay).
- Classifier failures (unparseable SDL mid-edit) → treat as **safe** and
  dispatch; the schema editors already surface GraphQL syntax errors through
  their own linting, and blocking dispatch on a transient parse error would
  fight the editing flow.

## Out of scope

- Persisting the advisory choice beyond the session (localStorage) — revisit
  if session-scoped asking proves noisy.
- A "published/locked" flag in the `powerhouse/document-model` schema itself
  (meta-model change).
- `SET_MODEL_ID` identity-change warnings.
- Per-component `disabled` threading for frozen views.
- Editing or deleting old specifications.
