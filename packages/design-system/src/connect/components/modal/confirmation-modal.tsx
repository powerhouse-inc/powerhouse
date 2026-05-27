import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Modal } from "#design-system";
import { twMerge } from "tailwind-merge";
import { ModalButton } from "./modal-button.js";

type ModalProps = ComponentPropsWithoutRef<typeof Modal>;

export type ConfirmationModalProps = {
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly header: ReactNode;
  readonly body?: ReactNode;
  readonly cancelLabel: string;
  readonly continueLabel: string;
  readonly onCancel: () => void;
  readonly onContinue: () => void;
  readonly continueDisabled?: boolean;
  readonly overlayProps?: ModalProps["overlayProps"];
  readonly contentProps?: ModalProps["contentProps"];
};

export function ConnectConfirmationModal(props: ConfirmationModalProps) {
  const {
    open,
    onOpenChange,
    header,
    body,
    cancelLabel,
    continueLabel,
    onCancel,
    onContinue,
    continueDisabled,
    overlayProps,
    contentProps,
  } = props;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      overlayProps={overlayProps}
      contentProps={contentProps}
    >
      <div className="w-[400px] p-6">
        <div className="pb-2 text-2xl font-bold text-gray-800 dark:text-slate-100">
          {header}
        </div>
        <div className="my-6 rounded-md bg-slate-50 p-4 text-center text-gray-800 dark:bg-slate-700 dark:text-slate-100">
          {body}
        </div>
        <div className="mt-8 flex justify-between gap-3">
          <ModalButton variant="cancel" onClick={onCancel}>
            {cancelLabel}
          </ModalButton>
          <ModalButton
            variant="confirm"
            disabled={continueDisabled}
            onClick={onContinue}
          >
            {continueLabel}
          </ModalButton>
        </div>
      </div>
    </Modal>
  );
}
