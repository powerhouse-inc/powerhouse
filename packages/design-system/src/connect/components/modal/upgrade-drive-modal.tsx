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
      <div className="w-100 bg-background p-6 text-foreground">
        <div className="pb-2 text-2xl font-bold text-foreground">{header}</div>
        <div className="my-6 rounded-md bg-background p-4 text-center text-foreground">
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
