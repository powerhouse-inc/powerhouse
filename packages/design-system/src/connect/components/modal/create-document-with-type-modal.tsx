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
  return `${option.documentType}::${option.version ?? "latest"}`;
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

  const handleOpenChange = (open: boolean) => {
    onOpenChange?.(open);
    if (!open) resetAfterClose();
  };

  const handleCancel = () => {
    handleOpenChange(false);
  };

  const handleTypeChange = (value: string) => {
    // Unreachable today (the sentinel never appears in the open list), kept as defense.
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
      onOpenChange={handleOpenChange}
      overlayProps={overlayProps}
      title="Create a new document"
      {...restProps}
    >
      <form
        name="create-document-with-type"
        className="max-h-[85vh] w-100 overflow-y-auto rounded-xl bg-background p-6 text-foreground"
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
            listClassName="max-h-80 overflow-y-auto overscroll-contain"
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
