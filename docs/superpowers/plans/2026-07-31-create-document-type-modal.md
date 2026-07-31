# Create Document With Type Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic drive explorer's per-document-type button grid with a single "Create New Document" button that opens a new design-system modal combining a name input and a document-type select.

**Architecture:** A new reusable `CreateDocumentWithTypeModal` component in `@powerhousedao/design-system` (modeled on the existing `CreateDocumentModal`), rendered locally by the drive explorer footer with `useState` — not routed through the global `PHModal` event store. The footer calls `addDocument` + `setSelectedNode` directly, the same calls Connect's modal wrapper makes.

**Tech Stack:** React 19, Tailwind (design-system theme classes), Radix dialog (via existing `Modal` primitive), vitest + happy-dom + @testing-library/react (design-system tests), Playwright (vetra-e2e).

**Spec:** `docs/superpowers/specs/2026-07-31-create-document-type-modal-design.md`

## Global Constraints

- Monorepo tooling: `pnpm` for workspace commands; conventional commits with package scope (e.g. `feat(design-system): …`).
- Exact copy strings (must match everywhere, including tests):
  - Button label: `Create New Document`
  - Modal title: `Create a new document`
  - Select placeholder: `Select document type…` (Unicode ellipsis `…`, not three dots)
  - Select label: `Document type`
  - Name input placeholder: `Document name`
  - Invalid-name error: `Document name must not be empty or contain control characters.`
  - Modal buttons: `Cancel`, `Create`
- Select option key format: `` `${documentType}::${version ?? 1}` ``.
- Create enabled iff `isValidName(name)` (from `@powerhousedao/shared/document-drive`) AND a real type is selected.
- Do NOT modify: `ConnectSelect`, the existing `CreateDocumentModal`, `PHModal` types in reactor-browser, Connect, the Vetra drive app, codegen templates.
- `addDocument` has no version parameter — the selected `version` is reported by `onCreate` but intentionally unused by the footer (spec section 5).
- The temporary `__fake-document-models.ts` scaffolding in the footer stays (separate cleanup).
- Dev server note: the user runs `pnpm run dev` in `apps/connect` themselves — do not start dev servers; the vite `source` condition serves `packages/*` edits from TS source with HMR.

---

### Task 1: `CreateDocumentWithTypeModal` component in design-system

**Files:**
- Create: `packages/design-system/src/connect/components/modal/create-document-with-type-modal.tsx`
- Modify: `packages/design-system/src/connect/components/modal/index.ts` (add one export line)
- Test: `packages/design-system/src/connect/components/modal/create-document-with-type-modal.test.tsx`

**Interfaces:**
- Consumes: `Modal`, `Icon` from `#design-system`; `FormInput` from `../form-input/form-input.js`; `Label` from `../form/inputs/label.js`; `ConnectSelect`, `ConnectSelectItem` from `../select/select.js`; `ModalButton` from `./modal-button.js`; `isValidName` from `@powerhousedao/shared/document-drive`.
- Produces (Task 2 relies on these exact names, importable from `@powerhousedao/design-system/connect`):
  - `type DocumentTypeOption = { readonly documentType: string; readonly name: string; readonly version?: number; readonly description?: string }`
  - `CreateDocumentWithTypeModal(props: CreateDocumentWithTypeModalProps)` where props extend `ComponentPropsWithoutRef<typeof Modal>` with `documentTypes: readonly DocumentTypeOption[]`, `onCreate: (input: { name: string; documentType: string; version?: number }) => void`, `onTypeSelected?: (documentType: string) => void`.

- [ ] **Step 1: Write the failing test**

Create `packages/design-system/src/connect/components/modal/create-document-with-type-modal.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateDocumentWithTypeModal } from "./create-document-with-type-modal.js";

const documentTypes = [
  {
    documentType: "powerhouse/invoice",
    name: "Invoice",
    description: "Billing document",
  },
  { documentType: "powerhouse/todo", name: "To-do List", version: 2 },
];

function setup() {
  const onCreate = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <CreateDocumentWithTypeModal
      documentTypes={documentTypes}
      onCreate={onCreate}
      onOpenChange={onOpenChange}
      open
    />,
  );
  return { onCreate, onOpenChange };
}

function fillName(value: string) {
  fireEvent.change(screen.getByPlaceholderText("Document name"), {
    target: { value },
  });
}

function pickTodoType() {
  // Open the select by clicking the placeholder row, then click the option.
  fireEvent.click(screen.getByText("Select document type…"));
  fireEvent.click(screen.getByText("To-do List v2"));
}

function createButton() {
  return screen.getByRole("button", { name: "Create" });
}

describe("CreateDocumentWithTypeModal", () => {
  it("renders placeholder and a disabled Create button", () => {
    setup();
    expect(screen.getByText("Select document type…")).toBeInTheDocument();
    expect(screen.getByText("Create a new document")).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
  });

  it("does not enable Create with a name but no type", () => {
    setup();
    fillName("My document");
    expect(createButton()).toBeDisabled();
  });

  it("does not enable Create with a type but no name", () => {
    setup();
    pickTodoType();
    expect(createButton()).toBeDisabled();
  });

  it("enables Create with name + type and fires onCreate with the payload", () => {
    const { onCreate } = setup();
    fillName("My document");
    pickTodoType();
    expect(createButton()).toBeEnabled();
    fireEvent.click(createButton());
    expect(onCreate).toHaveBeenCalledWith({
      name: "My document",
      documentType: "powerhouse/todo",
      version: 2,
    });
  });

  it("drops the placeholder from the options once a type is selected", () => {
    setup();
    pickTodoType();
    expect(screen.queryByText("Select document type…")).not.toBeInTheDocument();
  });

  it("shows the error line for a whitespace-only name", () => {
    setup();
    fillName("   ");
    expect(
      screen.getByText(
        "Document name must not be empty or contain control characters.",
      ),
    ).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
  });

  it("versionless options display the bare name and report version undefined", () => {
    const { onCreate } = setup();
    fillName("Inv 1");
    fireEvent.click(screen.getByText("Select document type…"));
    fireEvent.click(screen.getByText("Invoice"));
    fireEvent.click(createButton());
    expect(onCreate).toHaveBeenCalledWith({
      name: "Inv 1",
      documentType: "powerhouse/invoice",
      version: undefined,
    });
  });

  it("cancel closes without firing onCreate", () => {
    const { onCreate, onOpenChange } = setup();
    fillName("My document");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
```

Note: `fireEvent.click` on the submit button triggers the form submit in
happy-dom. If the "fires onCreate" case unexpectedly fails with the button
enabled but `onCreate` uncalled, submit the form node directly instead:
`fireEvent.submit(document.querySelector('form[name="create-document-with-type"]')!)`.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/p/Powerhouse/powerhouse
pnpm --filter @powerhousedao/design-system exec vitest run src/connect/components/modal/create-document-with-type-modal.test.tsx
```

Expected: FAIL — cannot resolve `./create-document-with-type-modal.js` (file does not exist yet).

- [ ] **Step 3: Write the component**

Create `packages/design-system/src/connect/components/modal/create-document-with-type-modal.tsx`. This mirrors `create-document-modal.tsx` (same shell, title, FormInput, ModalButton, reset-after-close pattern) and adds the labeled select:

```tsx
import { Icon, Modal } from "#design-system";
import { isValidName } from "@powerhousedao/shared/document-drive";
import type { ComponentPropsWithoutRef } from "react";
import { useCallback, useState } from "react";
import { FormInput } from "../form-input/form-input.js";
import { Label } from "../form/inputs/label.js";
import type { ConnectSelectItem } from "../select/select.js";
import { ConnectSelect } from "../select/select.js";
import { ModalButton } from "./modal-button.js";

export type DocumentTypeOption = {
  readonly documentType: string;
  readonly name: string;
  readonly version?: number;
  readonly description?: string;
};

export type CreateDocumentWithTypeModalProps = ComponentPropsWithoutRef<
  typeof Modal
> & {
  readonly documentTypes: readonly DocumentTypeOption[];
  readonly onCreate: (input: {
    name: string;
    documentType: string;
    version?: number;
  }) => void;
  readonly onTypeSelected?: (documentType: string) => void;
};

const CLOSE_ANIMATION_DURATION = 300;
// ConnectSelect has no placeholder support (it falls back to items[0]), so an
// empty-string sentinel item stands in until the user picks a real type.
const PLACEHOLDER_KEY = "";

function optionKey(option: DocumentTypeOption): string {
  return `${option.documentType}::${option.version ?? 1}`;
}

function optionDisplayName(option: DocumentTypeOption): string {
  return option.version ? `${option.name} v${option.version}` : option.name;
}

export function CreateDocumentWithTypeModal(
  props: CreateDocumentWithTypeModalProps,
) {
  const {
    documentTypes,
    onCreate,
    onTypeSelected,
    onOpenChange,
    overlayProps,
    contentProps,
    ...restProps
  } = props;

  const [documentName, setDocumentName] = useState("");
  const [isNameValid, setIsNameValid] = useState(false);
  const [selectedKey, setSelectedKey] = useState(PLACEHOLDER_KEY);

  const selectedOption = documentTypes.find(
    (option) => optionKey(option) === selectedKey,
  );
  const canCreate = isNameValid && selectedOption !== undefined;

  const typeItems: ConnectSelectItem<string>[] = documentTypes.map(
    (option) => ({
      value: optionKey(option),
      displayValue: optionDisplayName(option),
      description: option.description,
    }),
  );
  // The sentinel exists only while nothing is selected, so it can never be
  // re-selected once a real choice is made.
  const items =
    selectedKey === PLACEHOLDER_KEY
      ? [
          { value: PLACEHOLDER_KEY, displayValue: "Select document type…" },
          ...typeItems,
        ]
      : typeItems;

  const resetAfterClose = useCallback(() => {
    setTimeout(() => {
      setDocumentName("");
      setIsNameValid(false);
      setSelectedKey(PLACEHOLDER_KEY);
    }, CLOSE_ANIMATION_DURATION);
  }, []);

  const handleCancel = () => {
    onOpenChange?.(false);
    resetAfterClose();
  };

  const handleTypeChange = (value: string) => {
    if (value === PLACEHOLDER_KEY) return;
    setSelectedKey(value);
    const option = documentTypes.find((o) => optionKey(o) === value);
    if (option) onTypeSelected?.(option.documentType);
  };

  const handleCreate = useCallback(() => {
    if (!canCreate) return;
    onCreate({
      name: documentName,
      documentType: selectedOption.documentType,
      version: selectedOption.version,
    });
    resetAfterClose();
  }, [canCreate, documentName, onCreate, resetAfterClose, selectedOption]);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      handleCreate();
    },
    [handleCreate],
  );

  return (
    <Modal
      contentProps={contentProps}
      onOpenChange={onOpenChange}
      overlayProps={overlayProps}
      {...restProps}
    >
      <form
        name="create-document-with-type"
        className="w-100 rounded-xl bg-background p-6 text-foreground"
        onSubmit={handleSubmit}
      >
        <div className="pb-2 text-2xl font-bold text-foreground">
          Create a new document
        </div>
        <div className="my-6">
          {!isNameValid && documentName ? (
            <div className="mb-2 text-destructive">
              Document name must not be empty or contain control characters.
            </div>
          ) : null}
          <FormInput
            icon={<Icon name="BrickGlobe" />}
            onChange={(e) => {
              const name = e.target.value;
              setDocumentName(name);
              setIsNameValid(isValidName(name));
            }}
            placeholder="Document name"
            required
            value={documentName}
          />
        </div>
        <div className="my-6">
          <Label
            className="mb-2 text-sm font-medium text-foreground"
            htmlFor="document-type"
          >
            Document type
          </Label>
          <ConnectSelect
            id="document-type"
            items={items}
            menuClassName="min-w-0"
            onChange={handleTypeChange}
            value={selectedKey}
          />
        </div>
        <div className="mt-8 flex justify-between gap-3">
          <ModalButton onClick={handleCancel} type="button" variant="cancel">
            Cancel
          </ModalButton>
          <ModalButton disabled={!canCreate} type="submit" variant="confirm">
            Create
          </ModalButton>
        </div>
      </form>
    </Modal>
  );
}
```

Two deliberate choices an implementer must not "fix":

- No `absolutePositionMenu` on `ConnectSelect`: the `Modal` content div is
  `overflow-hidden`, so an absolutely positioned menu could clip. In-flow
  expansion grows the modal instead.
- `menuClassName="min-w-0"` overrides ConnectSelect's `min-w-[360px]` row so
  the select fits the `w-100` (400px, `p-6`-padded) form.

Then add the export to `packages/design-system/src/connect/components/modal/index.ts`, keeping alphabetical order — after the `create-document-modal.js` line insert:

```ts
export * from "./create-document-with-type-modal.js";
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/p/Powerhouse/powerhouse
pnpm --filter @powerhousedao/design-system exec vitest run src/connect/components/modal/create-document-with-type-modal.test.tsx
```

Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck the package**

```bash
cd /home/p/Powerhouse/powerhouse && npx tsc --build packages/design-system
```

Expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
cd /home/p/Powerhouse/powerhouse
git add packages/design-system/src/connect/components/modal/create-document-with-type-modal.tsx \
        packages/design-system/src/connect/components/modal/create-document-with-type-modal.test.tsx \
        packages/design-system/src/connect/components/modal/index.ts
git commit -m "feat(design-system): add CreateDocumentWithTypeModal with document-type select"
```

---

### Task 2: Footer rewrite in the generic drive explorer

**Files:**
- Modify: `packages/powerhouse-vetra-packages/editors/generic-drive-explorer/components/create-document.tsx` (full rewrite, final content below)

**Interfaces:**
- Consumes: `CreateDocumentWithTypeModal`, `DocumentTypeOption` from `@powerhousedao/design-system/connect` (Task 1); `addDocument`, `setSelectedNode`, `useSelectedDriveSafe`, `useSelectedFolder`, `useParentFolderForSelectedNode`, `preloadEditorModule`, and the existing hooks from `@powerhousedao/reactor-browser`.
- Produces: the `CreateDocument` footer component (same export name; consumed unchanged by `../editor.tsx`).

No unit test in this package: it has no DOM test infrastructure (no happy-dom,
no @testing-library — its tests are node-env document-model tests), and adding
that infra for one component is out of scope. Behavioral coverage lives in the
Task 1 component tests and the Task 3 e2e specs.

- [ ] **Step 1: Replace the file content**

The file currently contains the button-grid version plus temporary fake-model
scaffolding (`__fake-document-models.ts` import and spread) — the scaffolding
MUST survive the rewrite. Replace the entire file with:

```tsx
import { PowerhouseButton } from "@powerhousedao/design-system";
import type { DocumentTypeOption } from "@powerhousedao/design-system/connect";
import { CreateDocumentWithTypeModal } from "@powerhousedao/design-system/connect";
import {
  addDocument,
  preloadEditorModule,
  setSelectedNode,
  useAllowedDocumentModelModules,
  useDisabledEditors,
  useEditorModules,
  useParentFolderForSelectedNode,
  useSelectedDriveSafe,
  useSelectedFolder,
  useUserPermissions,
} from "@powerhousedao/reactor-browser";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { useState } from "react";
// TEMP(dev): remove together with __fake-document-models.ts.
import {
  fakeDocumentModelModules,
  isFakeDocumentModelsEnabled,
} from "./__fake-document-models.js";

function toDocumentTypeOption(doc: DocumentModelModule): DocumentTypeOption {
  const spec = doc.documentModel.global;
  return {
    documentType: spec.id,
    name: spec.name,
    version: doc.version,
    description: spec.description,
  };
}

export function CreateDocument() {
  const [showModal, setShowModal] = useState(false);
  const { isAllowedToCreateDocuments } = useUserPermissions();
  // Respect Connect config: allowedDocumentTypes (allowlist) via the hook,
  // disabledEditors (denylist) subtracted below.
  const allowedDocumentModelModules = useAllowedDocumentModelModules();
  const editorModules = useEditorModules();
  const disabledEditors = useDisabledEditors() ?? [];
  const [selectedDrive] = useSelectedDriveSafe();
  const selectedFolder = useSelectedFolder();
  const parentFolder = useParentFolderForSelectedNode();
  // Drive containers are never documents-in-a-drive; hide them structurally so
  // this shared editor can't fail open when disabledEditors is unset.
  const DRIVE_CONTAINER_TYPES = [
    "powerhouse/document-drive",
    "powerhouse/reactor-drive",
  ];
  const filteredDocumentModelModules = allowedDocumentModelModules?.filter(
    (module) => {
      const id = module.documentModel.global.id;
      return (
        !DRIVE_CONTAINER_TYPES.includes(id) && !disabledEditors.includes(id)
      );
    },
  );
  // TEMP(dev): remove together with __fake-document-models.ts. Off unless
  // localStorage["ph:fakeDocModels"] === "1", so default behaviour is unchanged.
  const visibleDocumentModelModules = isFakeDocumentModelsEnabled()
    ? [...(filteredDocumentModelModules ?? []), ...fakeDocumentModelModules]
    : filteredDocumentModelModules;
  const preloadEditorsForType = (documentType: string) =>
    editorModules
      ?.filter((editorModule) =>
        editorModule.documentTypes.includes(documentType),
      )
      .forEach((editorModule) => {
        void preloadEditorModule(editorModule);
      });
  const handleCreate = async ({
    name,
    documentType,
  }: {
    name: string;
    documentType: string;
    version?: number;
  }) => {
    // version is display-only for now: addDocument has no version parameter,
    // the reactor resolves the latest module for the type (spec section 5).
    setShowModal(false);
    if (!selectedDrive) return;
    try {
      const node = await addDocument(
        selectedDrive.header.id,
        name,
        documentType,
        selectedFolder?.id ?? parentFolder?.id,
      );
      setSelectedNode(node);
    } catch (error) {
      console.error("Failed to create document:", error);
    }
  };
  if (!isAllowedToCreateDocuments) return null;
  if (!visibleDocumentModelModules?.length) return null;
  return (
    <div className="px-6 py-4">
      <PowerhouseButton onClick={() => setShowModal(true)}>
        Create New Document
      </PowerhouseButton>
      <CreateDocumentWithTypeModal
        documentTypes={visibleDocumentModelModules.map(toDocumentTypeOption)}
        onCreate={(input) => void handleCreate(input)}
        onOpenChange={setShowModal}
        onTypeSelected={preloadEditorsForType}
        open={showModal}
      />
    </div>
  );
}
```

Behavioral notes locked by the spec:

- The `"New document"` heading is gone; empty filtered list now renders
  `null` (previously an orphaned heading).
- Editor preloading moved from button-hover to select-change via
  `onTypeSelected`.
- `showCreateDocumentModal` (PHModal flow) is no longer imported here; the
  other callers of that flow are untouched.

- [ ] **Step 2: Typecheck both packages**

```bash
cd /home/p/Powerhouse/powerhouse && npx tsc --build packages/powerhouse-vetra-packages
```

Expected: exit 0.

- [ ] **Step 3: Run the package's existing tests (regression only)**

```bash
cd /home/p/Powerhouse/powerhouse && pnpm --filter @powerhousedao/powerhouse-vetra-packages test
```

Expected: PASS (document-model tests; nothing here touches them, this is a regression gate).

- [ ] **Step 4: Commit**

```bash
cd /home/p/Powerhouse/powerhouse
git add packages/powerhouse-vetra-packages/editors/generic-drive-explorer/components/create-document.tsx
git commit -m "feat(powerhouse-vetra-packages): replace document-type button grid with Create New Document modal"
```

---

### Task 3: Update the two vetra-e2e specs that script the old footer

**Files:**
- Modify: `test/vetra-e2e/tests/generic-drive-hidden-vetra-documents.spec.ts:69-81`
- Modify: `test/vetra-e2e/tests/todo-document.spec.ts:502-519`

**Interfaces:**
- Consumes: the UI from Tasks 1–2 (button label `Create New Document`, select placeholder `Select document type…`, select id `document-type`, name placeholder `Document name`).
- Produces: nothing downstream.

These are Playwright specs that run in CI (`pnpm test:e2e:vetra`) against a
built Connect + published test package; they are not expected to run in this
plan. Update them so CI stays green; verify with typecheck only.

- [ ] **Step 1: Update `generic-drive-hidden-vetra-documents.spec.ts`**

Replace the block at lines 69–81 (the `"New document"` heading assertion, the
`.flex.w-full.flex-wrap.gap-4` section locator, and the hidden-name loop over
section buttons):

```ts
  // 4. Positive control: the "Create New Document" button renders.
  const createDocumentButton = page.getByRole("button", {
    name: "Create New Document",
  });
  await expect(createDocumentButton).toBeVisible({ timeout: 30_000 });
  await createDocumentButton.click();

  // 5. DocumentModel + every vetra builder-spec type must be absent from the
  // document-type select. ConnectSelect keeps its options in the DOM even
  // while collapsed, so presence is checked without opening the menu.
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Select document type…", { exact: true }),
  ).toBeVisible({ timeout: 10_000 });
  for (const hiddenName of HIDDEN_DISPLAY_NAMES) {
    await expect(
      dialog.getByText(hiddenName, { exact: true }),
    ).toHaveCount(0, { timeout: 30_000 });
  }
```

- [ ] **Step 2: Update `todo-document.spec.ts`**

Replace the block at lines 502–519 (button-per-type click, name fill, Create
click). The `Create` locator MUST use `exact: true` — Playwright's `name`
matching is substring by default, and `"Create"` would also match the footer's
`"Create New Document"` button, a strict-mode violation:

```ts
    // Step 11: Create a document of the installed package type via the
    // "Create New Document" modal.
    const createDocumentButton = page.getByRole("button", {
      name: "Create New Document",
    });
    await expect(createDocumentButton).toBeVisible({ timeout: 30_000 });
    await createDocumentButton.click();

    const dialog = page.getByRole("dialog");

    // Fill in document name in the create document dialog
    const docNameInput = dialog.locator('input[placeholder="Document name"]');
    await expect(docNameInput).toBeVisible({ timeout: 10_000 });
    await docNameInput.fill("TestTodoDoc");

    // Pick the ToDoDocument type from the select
    await dialog.getByText("Select document type…", { exact: true }).click();
    await dialog.getByText("ToDoDocument", { exact: false }).first().click();

    const createDocButton = dialog.getByRole("button", {
      name: "Create",
      exact: true,
    });
    await expect(createDocButton).toBeEnabled({ timeout: 5_000 });
    await createDocButton.click();
```

Keep everything after this block (document-created assertions) unchanged.

- [ ] **Step 3: Typecheck the e2e package**

```bash
cd /home/p/Powerhouse/powerhouse && pnpm --filter test-package-vetra typecheck
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd /home/p/Powerhouse/powerhouse
git add test/vetra-e2e/tests/generic-drive-hidden-vetra-documents.spec.ts \
        test/vetra-e2e/tests/todo-document.spec.ts
git commit -m "test(vetra-e2e): script the Create New Document modal instead of per-type buttons"
```

---

### Task 4: Final verification

**Files:** none created or modified.

- [ ] **Step 1: Full design-system test suite**

```bash
cd /home/p/Powerhouse/powerhouse && pnpm --filter @powerhousedao/design-system test
```

Expected: PASS, including the 8 new modal tests.

- [ ] **Step 2: Typecheck the affected graph**

```bash
cd /home/p/Powerhouse/powerhouse && npx tsc --build packages/design-system packages/powerhouse-vetra-packages apps/connect
```

Expected: exit 0.

- [ ] **Step 3: Lint the touched packages**

```bash
cd /home/p/Powerhouse/powerhouse
pnpm --filter @powerhousedao/design-system lint
pnpm --filter @powerhousedao/powerhouse-vetra-packages lint
```

Expected: exit 0 (warnings acceptable if pre-existing; no new errors in the touched files).

- [ ] **Step 4: Hand off manual verification to the user**

Do NOT start the dev server. Report to the user that the feature is ready to
inspect: run `pnpm run dev` in `apps/connect`, enable the fake models
(`localStorage.setItem("ph:fakeDocModels", "1"); location.reload();`), open a
drive, and check: single "Create New Document" button in the footer → modal
with name input + "Select document type…" select → Create disabled until both
are set → creating a fake type closes the modal and no-ops (fakes are not
registered with the reactor — expected) → with fakes disabled and no real
packages installed, the footer renders nothing.
