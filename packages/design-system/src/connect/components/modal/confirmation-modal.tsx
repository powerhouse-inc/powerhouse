import type { ComponentPropsWithoutRef } from "react";

import type { DivProps } from "#design-system";
import { mergeClassNameProps, Modal } from "#design-system";
import { twMerge } from "tailwind-merge";
import { ModalButton } from "./modal-button.js";

const buttonStyles =
  "min-h-[48px] min-w-[142px] text-base font-semibold py-3 px-6 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all";

type ButtonProps = ComponentPropsWithoutRef<"button">;

export type ConfirmationModalProps = ComponentPropsWithoutRef<typeof Modal> & {
  readonly header: React.ReactNode;
  readonly body?: React.ReactNode;
  readonly onCancel: () => void;
  readonly onContinue: () => void;
  readonly cancelLabel: string;
  readonly continueLabel: string;
  readonly bodyProps?: DivProps;
  readonly cancelButtonProps?: ButtonProps;
  readonly continueButtonProps?: ButtonProps;
  readonly headerProps?: DivProps;
  readonly buttonContainerProps?: DivProps;
  readonly containerProps?: DivProps;
};

export function ConnectConfirmationModal(props: ConfirmationModalProps) {
  const {
    body,
    header,
    children,
    onCancel,
    onOpenChange,
    onContinue,
    cancelLabel,
    continueLabel,
    overlayProps,
    contentProps,
    bodyProps = {},
    headerProps = {},
    containerProps = {},
    cancelButtonProps = {},
    continueButtonProps = {},
    buttonContainerProps = {},
    ...restProps
  } = props;

  return (
    <Modal
      contentProps={{
        ...contentProps,
        className: twMerge("rounded-3xl", contentProps?.className),
      }}
      onOpenChange={onOpenChange}
      overlayProps={{
        ...overlayProps,
        className: overlayProps?.className,
      }}
      {...restProps}
    >
      <div
        {...mergeClassNameProps(
          containerProps,
          "w-[400px] bg-white p-6 text-slate-300 dark:bg-slate-800 dark:text-slate-600 rounded-xl",
        )}
      >
        <div
          {...mergeClassNameProps(
            headerProps,
            "pb-2 text-2xl font-bold text-gray-800 dark:text-slate-100",
          )}
        >
          {header}
        </div>
        <div
          {...mergeClassNameProps(
            bodyProps,
            "my-6 rounded-md bg-slate-50 p-4 text-center dark:bg-slate-800 text-gray-800 dark:text-slate-100",
          )}
        >
          {body}
          {children}
        </div>
        <div
          {...mergeClassNameProps(
            buttonContainerProps,
            "mt-8 flex justify-between gap-3",
          )}
        >
          <ModalButton variant="cancel" onClick={onCancel}>
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
