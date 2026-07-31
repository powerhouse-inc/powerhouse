# Final fix wave — user request + whole-branch review findings

Work from /home/p/Powerhouse/powerhouse. Branch: feat-connect-createDocumentFlow.

## Fix 0 (USER REQUEST, highest priority): scrollable document-type dropdown

Today the ConnectSelect dropdown expands fully in-flow — with many document
types the modal grows unbounded. Cap the option list and let it scroll.

`packages/design-system/src/connect/components/select/select.tsx` — ADDITIVE
change only (the select is used elsewhere; default behavior must not change):

1. Add to `ConnectSelectProps`: `listClassName?: string;` with doc comment
   `/** Applied to the expanded options list, e.g. to cap its height and make it scrollable. */`
2. Destructure it in the component.
3. The expanding options container is the div currently classed:
   `twMerge("max-h-0 w-full overflow-hidden bg-inherit transition-[max-height] ease-in-out", showItems && "max-h-screen", absolutePositionMenu && "absolute")`
   Append `showItems && listClassName` as the LAST twMerge argument. It must be
   applied only while open — unconditional application would let a `max-h-*`
   value override the collapsed `max-h-0` and leak the closed list.

`packages/design-system/src/connect/components/modal/create-document-with-type-modal.tsx`:

4. Pass `listClassName="max-h-80 overflow-y-auto overscroll-contain"` to the
   `ConnectSelect`.
5. Safety cap for small windows (review finding #4): on the `<form>` shell,
   extend the className to
   `"max-h-[85vh] w-100 overflow-y-auto rounded-xl bg-background p-6 text-foreground"`.
   (The Modal overlay is the page's only scroll region and center-aligns its
   content, so an over-tall modal's top edge becomes unreachable without this.)

## Fix 1 (review #5 — spec requirement): dismiss must reset state

Spec says "Cancel or dismiss resets name and selection after the close
animation", but only the Cancel button resets. Escape / outside-click go
through Radix straight to `onOpenChange` and skip the reset; the component
stays mounted in its consumer, so reopening shows stale name + type with
Create already enabled.

In `create-document-with-type-modal.tsx`:

```tsx
const handleOpenChange = (open: boolean) => {
  onOpenChange?.(open);
  if (!open) resetAfterClose();
};
```

Pass `handleOpenChange` (not `onOpenChange`) to `<Modal onOpenChange=…>`. In
`handleCancel`, replace the body with `handleOpenChange(false);` so the reset
isn't duplicated.

## Fix 2 (review #8): accessible dialog name

Pass `title="Create a new document"` to the `<Modal>` in
`create-document-with-type-modal.tsx` (the Modal primitive renders it into a
visually-hidden Radix Title; without it the dialog announces as "Modal").

## Fix 3 (review #7): optionKey collision for versionless vs v1

`optionKey` maps both `version: undefined` and `version: 1` to `type::1` — a
real collision (`documentModelDocumentModelModule` ships versionless). Change:

```ts
return `${option.documentType}::${option.version ?? "latest"}`;
```

## Fix 4 (review #9): comment the dead placeholder guard

In `handleTypeChange`, above `if (value === PLACEHOLDER_KEY) return;` add:
`// Unreachable today (the sentinel never appears in the open list), kept as defense.`

## Fix 5 (review #10): two missing component tests

In `create-document-with-type-modal.test.tsx` add:

1. `onTypeSelected` fires with the documentType (not the option key):

```tsx
it("reports the selected documentType via onTypeSelected", () => {
  const onTypeSelected = vi.fn();
  const onCreate = vi.fn();
  render(
    <CreateDocumentWithTypeModal
      documentTypes={documentTypes}
      onCreate={onCreate}
      onTypeSelected={onTypeSelected}
      open
    />,
  );
  fireEvent.click(screen.getByText("Select document type…"));
  fireEvent.click(screen.getByText("To-do List v2"));
  expect(onTypeSelected).toHaveBeenCalledWith("powerhouse/todo");
});
```

2. Dismiss resets name and selection (drive Radix's Escape path with fake
   timers; component stays controlled-open so state is observable):

```tsx
it("resets name and selection when dismissed (Escape)", () => {
  vi.useFakeTimers();
  try {
    setup();
    fillName("My document");
    pickTodoType();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    vi.advanceTimersByTime(300);
    expect(screen.getByPlaceholderText("Document name")).toHaveValue("");
    expect(screen.getByText("Select document type…")).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
```

If Radix's Escape handling doesn't fire under happy-dom, fall back to firing
Escape on `document` (`fireEvent.keyDown(document, { key: "Escape" })`); if it
still doesn't reach `onOpenChange`, test the wrapper directly by rerendering
with `open={false}` then advancing timers, and note which variant you used in
your report.

## Fix 6 (review #2): hidden-name assertions in e2e are vacuous under exact:true

`test/vetra-e2e/tests/generic-drive-hidden-vetra-documents.spec.ts` — option
labels render as `${name} v${version}` for versioned modules, so
`getByText("App Module", { exact: true })` can never match "App Module v1" and
`toHaveCount(0)` passes vacuously. Replace the loop body's locator with a
regex anchored to the start with an optional version suffix:

```ts
for (const hiddenName of HIDDEN_DISPLAY_NAMES) {
  const escaped = hiddenName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(
    dialog.getByText(new RegExp(`^${escaped}( v\\d+)?$`)),
  ).toHaveCount(0, { timeout: 30_000 });
}
```

## Fix 7 (review #1, adjudicated): document the cross-spec ordering dependency

Same spec file: the positive control (`Create New Document` button visible)
only holds because `document-creation.spec.ts` runs first (playwright config:
`workers: 1`, files alphabetical) and generates a creatable project-local
model. Add a comment above the positive-control block:

```ts
  // NOTE: this positive control depends on document-creation.spec.ts having
  // run first (workers: 1, alphabetical file order): it generates a creatable
  // project-local document model. With zero creatable types the footer
  // deliberately renders nothing (see create-document.tsx), and this spec
  // would fail here if run in isolation.
```

## Fix 8 (review #11 + Task 4 lint warning): stale comments + dead helper

1. `packages/powerhouse-vetra-packages/editors/generic-drive-explorer/components/__fake-document-models.ts`:
   - Header comment says "Delete this file (and its two references in
     create-document.tsx) before committing" — now wrong (the file is
     deliberately committed). Reword to: temporary scaffolding for UI
     iteration, committed on purpose, remove when real packages are installed
     and the create-document UI work is finished.
   - The comment block describing the old flow ("clicking one opens
     CreateDocumentModal and then no-ops: the modal bails at `if
     (!selectedDrive || !documentModel) return;`") is stale — the new flow
     goes through `addDocument`, which rejects unknown types and lands in the
     footer's `console.error`. Update it.
   - Line ~29: fix the `@typescript-eslint/no-unnecessary-condition` warning
     (`globalThis.localStorage?.getItem` — localStorage is non-nullish in the
     checked type). Keep the try/catch (it guards privacy-mode throws), drop
     the unnecessary `?.`.
2. `test/vetra-e2e/tests/helpers/document.ts` — `isDocumentAvailableForCreation`
   targets the deleted `.flex.w-full.flex-wrap.gap-4` grid and has no callers.
   Verify no references (`grep -rn isDocumentAvailableForCreation test/`), then
   delete the function (and its export). If anything does reference it, report
   instead of deleting.

## Fix 9 (USER REQUEST): more fake document types to exercise the scrollbar

In `__fake-document-models.ts`, extend `FAKE_SPECS` so the dropdown clearly
overflows its new `max-h-80` cap — bring the list to ~20 entries total. Keep
the existing 8 entries as-is (tests and the user's manual checks reference
them), then append ~12 more in the same style: kebab-case `fake/<slug>` ids,
plausible Powerhouse-flavored names and one-line descriptions (e.g. Expense
Report, Meeting Notes, OKR Tracker, Team Roster, Product Roadmap, Bug Report,
Design Review, Payroll Run, Grant Proposal, Treasury Report, Vendor Contract,
Quarterly Forecast). No new versioned duplicates needed. Update the header
comment's mention of entry count/purpose if it has one.

## Verification (run all, report output)

1. `pnpm --filter @powerhousedao/design-system exec vitest run src/connect/components/modal/create-document-with-type-modal.test.tsx` — all tests (8 old + 2 new) pass.
2. `pnpm --filter @powerhousedao/design-system test` — full suite green (the select change is additive; this is the regression gate for other ConnectSelect consumers).
3. `npx tsc --build packages/design-system packages/powerhouse-vetra-packages apps/connect` — exit 0.
4. `pnpm --filter test-package-vetra typecheck` — exit 0.
5. `pnpm --filter @powerhousedao/design-system exec eslint src/connect/components/select/select.tsx src/connect/components/modal/create-document-with-type-modal.tsx src/connect/components/modal/create-document-with-type-modal.test.tsx` — 0 problems.
6. `pnpm --filter @powerhousedao/powerhouse-vetra-packages exec eslint editors/generic-drive-explorer/components/__fake-document-models.ts` — 0 problems.

## Commits

Group as three conventional commits:
1. `feat(design-system): cap and scroll the document-type list; reset modal on dismiss` — select.tsx + modal + tests.
2. `chore(powerhouse-vetra-packages): refresh fake-document-models scaffolding (comments + more types)` — fakes file.
3. `test(vetra-e2e): tighten hidden-type assertions and document spec ordering` — spec + helpers.

## Out of scope — do NOT attempt

- Keyboard accessibility of ConnectSelect (tracked follow-up; a swap to
  SelectFieldRaw is a design decision the user hasn't made).
- Toasts for failed creation.
- Reset-timer ref hardening (review #6).
- Do not start any dev server.
