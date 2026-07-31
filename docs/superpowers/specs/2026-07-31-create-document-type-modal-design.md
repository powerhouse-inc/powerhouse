# Create Document With Type Modal — Design

> **Status:** approved 2026-07-31
> **Scope:** `packages/design-system` (new modal component), `packages/powerhouse-vetra-packages` (generic-drive-explorer footer)

## 1. Problem

The generic drive explorer's footer renders one button per creatable document model
(`packages/powerhouse-vetra-packages/editors/generic-drive-explorer/components/create-document.tsx`).
The list does not scale: with many installed packages the footer becomes a wall of
buttons. Clicking a button opens a name-only modal
(`packages/design-system/src/connect/components/modal/create-document-modal.tsx`)
with the document type already fixed.

## 2. Decision summary

Replace the button grid with a single **"Create New Document"** button that opens a
new modal combining a name input and a document-type select. Create is enabled only
when both a valid name is entered and a type is selected.

Decisions made during brainstorming:

- **Scope:** generic drive explorer only. The Vetra drive app
  (`packages/vetra/editors/vetra-drive-app/editor.tsx`) and the codegen app template
  (`packages/codegen/src/templates/app/components/CreateDocument.ts`) keep using the
  existing preselected-type modal. No changes to `PHModal` types, Connect, or the
  existing `CreateDocumentModal`.
- **Select default:** placeholder ("Select document type…"), no preselection.
- **Versions:** one select entry per model version, mirroring the current buttons
  ("Invoice v1", "Invoice v2" are separate options).
- **Architecture (option B of three considered):** new reusable design-system modal,
  rendered locally by the drive explorer with `useState` — not routed through the
  global `PHModal` event store, because the signalling component already owns all
  the data the modal needs.

## 3. New component: `CreateDocumentWithTypeModal`

**File:** `packages/design-system/src/connect/components/modal/create-document-with-type-modal.tsx`,
exported from the same barrel as `CreateDocumentModal`.

```ts
export type DocumentTypeOption = {
  documentType: string;   // "powerhouse/invoice"
  name: string;           // "Invoice"
  version?: number;
  description?: string;
};

export type CreateDocumentWithTypeModalProps =
  ComponentPropsWithoutRef<typeof Modal> & {
    readonly documentTypes: readonly DocumentTypeOption[];
    readonly onCreate: (input: {
      name: string;
      documentType: string;
      version?: number;
    }) => void;
    readonly onTypeSelected?: (documentType: string) => void;
  };
```

Visual and structural template is `create-document-modal.tsx`: same `Modal` wrapper,
same `w-100 rounded-xl bg-background p-6 text-foreground` form shell, title
"Create a new document", `FormInput` for the name with `isValidName` (from
`@powerhousedao/shared/document-drive`) validation and the same inline error text,
`ModalButton` cancel/confirm pair, and the same reset-state-after-close-animation
pattern (300 ms). Between the name input and the buttons sits a labeled
`ConnectSelect` ("Document type"), label styled like the drive form's
(`text-sm font-medium text-foreground`, see `add-local-drive-form.tsx`).

### Select behavior

`ConnectSelect` (`packages/design-system/src/connect/components/select/select.tsx`)
has no placeholder support — it requires a `value` and falls back to `items[0]`.
The modal therefore:

- keeps internal `selectedKey` state, initially `""`;
- while `selectedKey === ""`, prepends a sentinel item
  `{ value: "", displayValue: "Select document type…" }` to the items array;
- drops the sentinel once a real selection is made, so it cannot be re-selected;
- keys options as `` `${documentType}::${version ?? 1}` `` because versions
  duplicate the type id; display text is `Name` or `Name v2`; `description`
  passes through to ConnectSelect's description slot.

`ConnectSelect` itself is not modified.

### Validation and submit

- Create enabled iff `isValidName(name) && selectedKey !== ""`.
- Enter key submits the form (same as the existing modal).
- Cancel or dismiss resets name and selection after the close animation.
- On selection change, call `onTypeSelected?.(documentType)` (used for editor
  chunk preloading by the consumer).

## 4. Footer change: `create-document.tsx`

All hooks and filtering stay (permission gate, allowlist,
`disabledEditors`, `DRIVE_CONTAINER_TYPES`, the temporary fake-models spread).
The render changes:

- One `PowerhouseButton` labelled **"Create New Document"**; no "New document"
  heading; modal open/closed held in local `useState`.
- If the filtered module list is empty, render nothing (today an orphaned heading
  renders — deliberate behavior improvement).
- Options passed to the modal are built from the filtered modules:
  `{ documentType: id, name, version, description }`.
- `onTypeSelected` → existing `preloadEditorsForType` (preload moves from
  button-hover to select-change).
- `onCreate`:

  ```ts
  const node = await addDocument(
    driveId,
    name,
    documentType,
    selectedFolder?.id ?? parentFolder?.id,
  );
  setSelectedNode(node);
  ```

  using `useSelectedDriveSafe`, `useSelectedFolder`,
  `useParentFolderForSelectedNode`, `addDocument`, `setSelectedNode` from
  `@powerhousedao/reactor-browser` — the same call Connect's modal wrapper makes
  (`apps/connect/src/components/modal/modals/CreateDocumentModal.tsx`).
- If `addDocument` throws: `console.error` and close the modal. No new toast
  infrastructure.

## 5. Known limitation (pre-existing, documented not fixed)

`addDocument` has no version parameter
(`packages/reactor-browser/src/actions/document.ts:345`); the reactor resolves the
latest module for a type. Version entries in the select are therefore display-only:
choosing "Invoice v1" creates the latest Invoice version, exactly as today's v1
button does. `onCreate` still reports the selected `version` so a future
reactor-browser fix can be adopted without changing the modal's API. Out of scope
here.

## 6. Testing

- **Design-system component test** (vitest, alongside sibling component tests):
  - renders placeholder; Create disabled with empty name, with name only, and
    with type only;
  - picking a type then entering a valid name enables Create; submit fires
    `onCreate` with `{ name, documentType, version }`;
  - sentinel not present in the dropdown after a real selection;
  - cancel resets state; invalid name shows the error line.
- **Footer:** existing e2e specs around the drive footer to be located during
  planning (`test/`); update selectors that reference the per-type buttons.

## 7. Out of scope

- Version-faithful document creation (section 5).
- Unifying with the preselected-type modal used by the Vetra drive app and codegen
  templates.
- Search/filter inside the select (revisit if lists grow past a screenful).
- Removing the temporary `__fake-document-models.ts` scaffolding (separate cleanup,
  pre-dates this feature).
