# Final fix wave — report

Branch: `feat-connect-createDocumentFlow`. Work performed at repo root
`/home/p/Powerhouse/powerhouse`.

## Fix 0 — scrollable document-type dropdown (USER REQUEST)

- `packages/design-system/src/connect/components/select/select.tsx`
  - Added `listClassName?: string` to `ConnectSelectProps` (line 30-31) with
    the doc comment specified in the brief.
  - Destructured `listClassName` in the component (line 54).
  - Appended `showItems && listClassName` as the last `twMerge` argument on
    the expanding options container (line 99), so it only applies while open.
- `packages/design-system/src/connect/components/modal/create-document-with-type-modal.tsx`
  - Passed `listClassName="max-h-80 overflow-y-auto overscroll-contain"` to
    `ConnectSelect` (line 169).
  - Extended the `<form>` className to
    `"max-h-[85vh] w-100 overflow-y-auto rounded-xl bg-background p-6 text-foreground"`
    (line 135).

## Fix 1 — dismiss must reset state (review #5)

`create-document-with-type-modal.tsx`:
- Added `handleOpenChange` (lines 90-93): calls `onOpenChange?.(open)` then
  `resetAfterClose()` when `!open`.
- Passed `handleOpenChange` (not `onOpenChange`) to `<Modal onOpenChange=…>`
  (line 128).
- `handleCancel` now just calls `handleOpenChange(false)` (lines 95-97), so
  the reset isn't duplicated.

## Fix 2 — accessible dialog name (review #8)

`create-document-with-type-modal.tsx` line 130: passed
`title="Create a new document"` to `<Modal>`. Verified in
`packages/design-system/src/powerhouse/components/modal/modal.tsx` that this
renders into a visually-hidden Radix `Title`/`Description` (lines 50-53 of
that file).

Side effect discovered and handled: this makes "Create a new document" match
three DOM nodes (visible heading + hidden Title + hidden Description). The
pre-existing test `renders placeholder and a disabled Create button` used
`getByText` (throws on multiple matches) — updated to
`getAllByText(...).length` (see Fix 5/test section below). No other existing
test referenced that string.

## Fix 3 — optionKey collision (review #7)

`create-document-with-type-modal.tsx` line 36:
`return \`${option.documentType}::${option.version ?? "latest"}\`;` — versionless
options and `version: 1` options no longer collide.

## Fix 4 — comment the dead placeholder guard (review #9)

`create-document-with-type-modal.tsx` line 100: added
`// Unreachable today (the sentinel never appears in the open list), kept as defense.`
above the `if (value === PLACEHOLDER_KEY) return;` line in `handleTypeChange`.

## Fix 5 — two missing component tests (review #10)

`create-document-with-type-modal.test.tsx`:
1. Added `reports the selected documentType via onTypeSelected` (lines
   120-134) — verbatim per the brief.
2. Added `resets name and selection when dismissed (Escape)` (lines 136-160).

**Escape variant that worked:** neither the literal snippet
(`fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })`) nor the
same call with `code: "Escape"` added reached Radix's dismiss handling under
happy-dom (confirmed via an isolated probe test). **Document-level keydown**
(`fireEvent.keyDown(document, { key: "Escape", code: "Escape" })`) does reach
it — confirmed `onOpenChange` fires with `false`. That's the variant used.

A second, separate issue surfaced once Escape correctly fired
`onOpenChange`: `resetAfterClose`'s state updates run inside a bare
`setTimeout` callback, not inside a testing-library event, so
`vi.advanceTimersByTime(300)` outside of `act()` doesn't flush React's state
update into the DOM (confirmed by isolated probe: assertion failed without
`act()`, passed with it). Wrapped the `advanceTimersByTime` call in `act()`
(imported from `@testing-library/react`) — this is a test-code fix, not a
change to any Escape-handling variant, and is documented inline in the test.

No rerender-with-`open={false}` fallback was needed — the document-keydown
variant plus the `act()` wrap was sufficient.

Pre-existing test adjustment (side effect of Fix 2, see above):
`renders placeholder and a disabled Create button` now asserts
`getAllByText("Create a new document").length` is `> 0` instead of a single
`getByText` match, with an inline comment explaining why.

## Fix 6 — hidden-name assertions vacuous under exact:true (review #2)

`test/vetra-e2e/tests/generic-drive-hidden-vetra-documents.spec.ts`: replaced
the loop body's `dialog.getByText(hiddenName, { exact: true })` with the
regex-anchored form from the brief (escaped literal + optional `v\d+`
suffix), verbatim.

## Fix 7 — cross-spec ordering dependency (review #1)

Same file: added the NOTE comment verbatim above the positive-control block
(button-visibility check), documenting the `document-creation.spec.ts`
ordering dependency.

## Fix 8 — stale comments + dead helper (review #11 + Task 4 lint warning)

`packages/powerhouse-vetra-packages/editors/generic-drive-explorer/components/__fake-document-models.ts`:
- Reworded the header comment: no longer says "delete before committing";
  now states it's deliberately committed scaffolding, removed once real
  packages are installed and the create-document UI work is finished.
- Updated the stale flow description: fake types now go through `addDocument`
  (which rejects the unknown type), caught by `create-document.tsx`'s
  `console.error("Failed to create document:", error)` — no more mention of
  the old `CreateDocumentModal` no-op path.
- Line 29 (`isFakeDocumentModelsEnabled`): changed
  `globalThis.localStorage?.getItem(...)` to `globalThis.localStorage.getItem(...)`,
  keeping the surrounding try/catch.

`test/vetra-e2e/tests/helpers/document.ts`:
- Ran `grep -rn isDocumentAvailableForCreation test/` first — only hit was
  the function's own definition plus a generated `.tsbuild/**/*.d.ts` build
  artifact (not a source reference/caller). Deleted the function and its
  JSDoc (previously lines 59-72).

## Fix 9 — more fake document types (USER REQUEST)

`__fake-document-models.ts`: kept the original 8 `FAKE_SPECS` entries
untouched, appended 12 more in the same style (kebab-case `fake/<slug>` ids,
Powerhouse-flavored names/descriptions) exactly matching the brief's example
list: Expense Report, Meeting Notes, OKR Tracker, Team Roster, Product
Roadmap, Bug Report, Design Review, Payroll Run, Grant Proposal, Treasury
Report, Vendor Contract, Quarterly Forecast. Total is now 20 entries. Updated
the comment above `FAKE_SPECS` to note the ~20-entry count and its purpose
(overflowing the new `max-h-80` cap).

## Verification

1. `pnpm --filter @powerhousedao/design-system exec vitest run src/connect/components/modal/create-document-with-type-modal.test.tsx`
   → **1 file passed, 10/10 tests passed** (8 old + 2 new). Exit 0.
2. `pnpm --filter @powerhousedao/design-system test`
   → **31 files passed, 278/278 tests passed**. Exit 0.
3. `npx tsc --build packages/design-system packages/powerhouse-vetra-packages apps/connect`
   → No output, **exit 0**.
4. `pnpm --filter test-package-vetra typecheck`
   → `tsc --noEmit`, no output, **exit 0**.
5. `pnpm --filter @powerhousedao/design-system exec eslint src/connect/components/select/select.tsx src/connect/components/modal/create-document-with-type-modal.tsx src/connect/components/modal/create-document-with-type-modal.test.tsx`
   → Initially 1 prettier formatting error in the test file (line-wrapping of
   the new `getAllByText` assertion); fixed with `eslint --fix`. Re-run:
   **0 problems, exit 0**.
6. `pnpm --filter @powerhousedao/powerhouse-vetra-packages exec eslint editors/generic-drive-explorer/components/__fake-document-models.ts`
   → **0 problems, exit 0**.

## Files changed

- `packages/design-system/src/connect/components/select/select.tsx`
- `packages/design-system/src/connect/components/modal/create-document-with-type-modal.tsx`
- `packages/design-system/src/connect/components/modal/create-document-with-type-modal.test.tsx`
- `packages/powerhouse-vetra-packages/editors/generic-drive-explorer/components/__fake-document-models.ts`
- `test/vetra-e2e/tests/generic-drive-hidden-vetra-documents.spec.ts`
- `test/vetra-e2e/tests/helpers/document.ts`

## Commits created

1. `6132dd7fa` — `feat(design-system): cap and scroll the document-type list; reset modal on dismiss`
2. `86347b7ac` — `chore(powerhouse-vetra-packages): refresh fake-document-models scaffolding (comments + more types)`
3. `112f234f0` — `test(vetra-e2e): tighten hidden-type assertions and document spec ordering`

## Self-review findings

- The `title` prop on `<Modal>` is placed before `{...restProps}` in the JSX,
  so a caller who explicitly passes `title` to `CreateDocumentWithTypeModal`
  would override the default "Create a new document". This isn't specified
  either way in the brief; it seemed like reasonable, harmless default
  behavior (no current caller passes `title`) but is worth flagging as a
  design choice rather than an explicit requirement.
- Fix 2 (accessible title) directly caused a text-collision regression in an
  existing test, which was not called out in the brief. Fixed by relaxing
  that one assertion to `getAllByText(...).length > 0` with an explanatory
  comment, rather than skipping/deleting the check.
- The brief's literal Escape test snippet (`getByRole("dialog")` + no `act()`
  wrap) does not work as-is under this project's Radix/happy-dom/vitest
  fake-timers combination, for two independent reasons (see Fix 5 above).
  Both deviations are minimal, documented inline in the test, and verified by
  isolated probe tests before being applied to the real suite.
- Confirmed via `grep -rn isDocumentAvailableForCreation test/` that the only
  non-definition hit was a generated `.tsbuild` `.d.ts` artifact, not a real
  caller, before deleting the helper — consistent with the brief's
  instruction to report instead of deleting if any real reference existed.

## Concerns

- None blocking. The two items above (title-prop override ordering, and the
  test escape-hatch deviations from the brief's literal snippet) are worth a
  quick second look by a reviewer but do not affect correctness or the
  verification gate, which is fully green.
- Pre-existing unrelated local modifications to `apps/connect/vite.config.ts`
  and `nx.json` (dev-server source-resolution change and an `analytics: true`
  flag) were present in the working tree before this task started and were
  left untouched — not part of any of the three commits.

## Out of scope — confirmed not attempted

- Keyboard accessibility of ConnectSelect.
- Toasts for failed creation.
- Reset-timer ref hardening (review #6).
- No dev server was started.
