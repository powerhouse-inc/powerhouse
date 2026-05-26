import type { DivProps } from "#design-system";
import { Icon, mergeClassNameProps, Modal } from "#design-system";
import type { ComponentPropsWithoutRef } from "react";
import { twMerge } from "tailwind-merge";
import { ModalButton } from "./modal-button.js";

type ButtonProps = ComponentPropsWithoutRef<"button">;

export type ConnectReplaceDuplicateModalProps = ComponentPropsWithoutRef<
  typeof Modal
> & {
  readonly title?: string;
  readonly fileName?: string;
  readonly message?: string;
  readonly onDuplicate: () => void;
  readonly duplicateLabel?: string;
  readonly bodyProps?: DivProps;
  readonly replaceButtonProps?: ButtonProps;
  readonly duplicateButtonProps?: ButtonProps;
  readonly headerProps?: DivProps;
  readonly buttonContainerProps?: DivProps;
  readonly containerProps?: DivProps;
};

export function ConnectReplaceDuplicateModal(
  props: ConnectReplaceDuplicateModalProps,
) {
  const {
    title = "Document Already Exists",
    fileName,
    message,
    children,
    onOpenChange,
    onDuplicate,
    duplicateLabel = "Create Copy",
    overlayProps,
    contentProps,
    bodyProps = {},
    headerProps = {},
    containerProps = {},
    replaceButtonProps = {},
    duplicateButtonProps = {},
    buttonContainerProps = {},
    ...restProps
  } = props;

  const defaultMessage = fileName
    ? `A document named "${fileName}" already exists in this location. Would you like to replace it or create a copy?`
    : "A document with the same name already exists in this location. Would you like to replace it or create a copy?";

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
          "w-[450px] bg-white p-6 text-slate-300 dark:bg-slate-800 dark:text-slate-600 rounded-xl",
        )}
      >
        <div className="flex items-center justify-between pb-2 dark:bg-slate-600 dark:text-slate-100">
          <div
            {...mergeClassNameProps(
              headerProps,
              "text-2xl font-bold text-gray-800 dark:text-slate-100",
            )}
          >
            {title}
          </div>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded-md outline-none hover:bg-slate-100 dark:hover:bg-slate-700"
            onClick={() => onOpenChange?.(false)}
          >
            <Icon name="XmarkLight" size={24} />
          </button>
        </div>
        <div
          {...mergeClassNameProps(
            bodyProps,
            "my-6 rounded-md bg-slate-50 p-4 text-center dark:bg-slate-800 text-gray-800 dark:text-slate-100",
          )}
        >
          {message || defaultMessage}
          {children}
        </div>
        <div {...mergeClassNameProps(buttonContainerProps, "mt-8 flex")}>
          <ModalButton
            variant="confirm"
            onClick={onDuplicate}
            {...duplicateButtonProps}
          >
            {duplicateLabel}
          </ModalButton>
        </div>
      </div>
    </Modal>
  );
}
