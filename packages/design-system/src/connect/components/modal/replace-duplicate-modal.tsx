import type { DivProps } from "#design-system";
import { Icon, mergeClassNameProps, Modal } from "#design-system";
import type { ComponentPropsWithoutRef } from "react";
import { twMerge } from "tailwind-merge";

const buttonStyles =
  "min-h-[48px] min-w-[142px] text-base font-semibold py-3 px-6 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all";

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
          "w-[450px] bg-white p-6 text-slate-300 dark:bg-slate-900",
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-50 pb-2 dark:border-slate-700">
          <div
            {...mergeClassNameProps(
              headerProps,
              "text-2xl font-bold text-gray-800 dark:text-slate-50",
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
            "my-6 rounded-md bg-slate-50 p-4 text-center dark:bg-slate-800",
          )}
        >
          {message || defaultMessage}
          {children}
        </div>
        <div {...mergeClassNameProps(buttonContainerProps, "mt-8 flex")}>
          <button
            onClick={onDuplicate}
            {...mergeClassNameProps(
              duplicateButtonProps,
              twMerge(buttonStyles, "flex-1 bg-gray-800 text-gray-50"),
            )}
          >
            {duplicateLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
