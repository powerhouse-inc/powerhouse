import type { ComponentPropsWithoutRef } from "react";

import { Modal } from "#design-system";
import { ModalButton } from "./modal-button.js";

export type ConnectUpgradeDriveModalProps = ComponentPropsWithoutRef<
  typeof Modal
> & {
  readonly header: React.ReactNode;
  readonly body: React.ReactNode;
  readonly onContinue: () => void;
  readonly cancelLabel: string;
  readonly continueLabel: string;
};

export function ConnectUpgradeDriveModal(props: ConnectUpgradeDriveModalProps) {
  const {
    body,
    header,
    onOpenChange,
    onContinue,
    cancelLabel,
    continueLabel,
    overlayProps,
    contentProps,
    ...restProps
  } = props;

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
      <div className="w-100 bg-white p-6 text-slate-300 dark:bg-slate-800 dark:text-slate-200">
        <div className="pb-2 text-2xl font-bold text-gray-800 dark:text-slate-100">
          {header}
        </div>
        <div className="my-6 rounded-md bg-slate-50 p-4 text-center text-gray-800 dark:bg-slate-800 dark:text-slate-100">
          {body}
        </div>
        <div className="mt-8 flex justify-between gap-3">
          <ModalButton variant="cancel" onClick={() => onOpenChange?.(false)}>
            {cancelLabel}
          </ModalButton>
          <ModalButton variant="confirm" onClick={onContinue}>
            {continueLabel}
          </ModalButton>
        </div>
      </div>
    </Modal>
  );
}
