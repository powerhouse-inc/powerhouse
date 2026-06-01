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
};

const CLOSE_ANIMATION_DURATION = 300;

export function CreateDocumentModal(props: CreateDocumentModalProps) {
  const { onOpenChange, onContinue, overlayProps, contentProps, ...restProps } =
    props;

  const [nodeName, setNodeName] = useState("");
  const [isValid, setIsValid] = useState(false);

  const handleCancel = () => {
    onOpenChange?.(false);
    setTimeout(() => setNodeName(""), CLOSE_ANIMATION_DURATION);
  };

  const handleCreate = useCallback(() => {
    if (!isValid) {
      return;
    }

    onContinue(nodeName);
    setTimeout(() => setNodeName(""), CLOSE_ANIMATION_DURATION);
  }, [isValid, nodeName, onContinue]);

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
        className="w-100 rounded-xl bg-gray-50 p-6 text-gray-300 dark:bg-slate-800 dark:text-slate-600"
        onSubmit={handleSubmit}
      >
        <div className="pb-2 text-2xl font-bold text-gray-900 dark:text-slate-100">
          Create a new document
        </div>
        <div className="my-6">
          {!isValid && nodeName && (
            <div className="mb-2 text-red-500 dark:text-red-100">
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
        </div>
        <div className="mt-8 flex justify-between gap-3">
          <ModalButton variant="cancel" type="button" onClick={handleCancel}>
            Cancel
          </ModalButton>
          <ModalButton variant="confirm" type="submit" disabled={!isValid}>
            Create
          </ModalButton>
        </div>
      </form>
    </Modal>
  );
}
