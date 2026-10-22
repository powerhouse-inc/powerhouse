import { Icon, Modal } from "#design-system";
import { isValidName } from "@powerhousedao/shared/document-drive";
import type { ComponentPropsWithoutRef } from "react";
import { useCallback, useState } from "react";
import { FormInput } from "../form-input/form-input.js";
import { ModalButton } from "./modal-button.js";

export type CreateDocumentModalProps = ComponentPropsWithoutRef<
  typeof Modal
> & {
  readonly onContinue: (nodeName: string) => void;
  /** The drives to pick from when none is given; an empty list asks for one. */
  readonly drives?: readonly { id: string; name: string }[];
  readonly driveId?: string;
  readonly onDriveChange?: (driveId: string) => void;
  readonly onAddDrive?: () => void;
};

const CLOSE_ANIMATION_DURATION = 300;

export function CreateDocumentModal(props: CreateDocumentModalProps) {
  const {
    onOpenChange,
    onContinue,
    overlayProps,
    contentProps,
    drives,
    driveId,
    onDriveChange,
    onAddDrive,
    ...restProps
  } = props;
  const needsDrive = !!drives && !driveId;

  const [nodeName, setNodeName] = useState("");
  const [isValid, setIsValid] = useState(false);

  const handleCancel = () => {
    onOpenChange?.(false);
    setTimeout(() => setNodeName(""), CLOSE_ANIMATION_DURATION);
  };

  const handleCreate = useCallback(() => {
    if (!isValid || needsDrive) {
      return;
    }

    onContinue(nodeName);
    setTimeout(() => setNodeName(""), CLOSE_ANIMATION_DURATION);
  }, [isValid, needsDrive, nodeName, onContinue]);

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
      overlayProps={{
        ...overlayProps,
        className: overlayProps?.className,
      }}
      {...restProps}
    >
      <form
        name="create-document"
        className="w-100 rounded-xl bg-background p-6 text-foreground"
        onSubmit={handleSubmit}
      >
        <div className="pb-2 text-2xl font-bold text-foreground">
          Create a new document
        </div>
        <div className="my-6">
          {!isValid && nodeName && (
            <div className="mb-2 text-destructive">
              Document name must not be empty or contain control characters.
            </div>
          )}
          <FormInput
            icon={<Icon name="BrickGlobe" />}
            onChange={(e) => {
              const name = e.target.value;
              setNodeName(name);
              setIsValid(isValidName(name));
            }}
            placeholder="Document name"
            required
            value={nodeName}
          />
          {!!drives?.length && (
            <label className="mt-4 flex flex-col gap-1 text-sm text-muted-foreground">
              Drive
              <select
                className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
                value={driveId ?? ""}
                onChange={(e) => onDriveChange?.(e.target.value)}
              >
                {!driveId && <option value="">Choose a drive</option>}
                {drives.map((drive) => (
                  <option key={drive.id} value={drive.id}>
                    {drive.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {drives?.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              There's no drive to create it in.{" "}
              {onAddDrive && (
                <button
                  type="button"
                  className="cursor-pointer text-foreground underline"
                  onClick={onAddDrive}
                >
                  Add a drive
                </button>
              )}
            </p>
          )}
        </div>
        <div className="mt-8 flex justify-between gap-3">
          <ModalButton variant="cancel" type="button" onClick={handleCancel}>
            Cancel
          </ModalButton>
          <ModalButton
            variant="confirm"
            type="submit"
            disabled={!isValid || needsDrive}
          >
            Create
          </ModalButton>
        </div>
      </form>
    </Modal>
  );
}
