import { Icon, Modal } from "#design-system";
import type { ComponentPropsWithoutRef } from "react";
import { ModalButton } from "./modal-button.js";

type ModalProps = ComponentPropsWithoutRef<typeof Modal>;

export type ConnectReplaceDuplicateModalProps = {
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly title?: string;
  readonly fileName?: string;
  readonly message?: string;
  readonly duplicateLabel?: string;
  readonly onDuplicate: () => void;
  readonly overlayProps?: ModalProps["overlayProps"];
  readonly contentProps?: ModalProps["contentProps"];
};

export function ConnectReplaceDuplicateModal(
  props: ConnectReplaceDuplicateModalProps,
) {
  const {
    open,
    onOpenChange,
    title = "Document Already Exists",
    fileName,
    message,
    duplicateLabel = "Create Copy",
    onDuplicate,
    overlayProps,
    contentProps,
  } = props;

  const defaultMessage = fileName
    ? `A document named "${fileName}" already exists in this location. Would you like to replace it or create a copy?`
    : "A document with the same name already exists in this location. Would you like to replace it or create a copy?";

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      overlayProps={overlayProps}
      contentProps={contentProps}
    >
      <div className="w-[450px] p-6">
        <div className="flex items-center justify-between pb-2">
          <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">
            {title}
          </div>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded-md outline-none hover:effect"
            onClick={() => onOpenChange?.(false)}
          >
            <Icon name="XmarkLight" size={24} />
          </button>
        </div>
        <div className="my-6 rounded-md bg-gray-50 p-4 text-center text-gray-900 dark:bg-slate-700 dark:text-slate-100">
          {message || defaultMessage}
        </div>
        <div className="mt-8 flex">
          <ModalButton variant="confirm" onClick={onDuplicate}>
            {duplicateLabel}
          </ModalButton>
        </div>
      </div>
    </Modal>
  );
}
