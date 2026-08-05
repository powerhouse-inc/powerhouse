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

