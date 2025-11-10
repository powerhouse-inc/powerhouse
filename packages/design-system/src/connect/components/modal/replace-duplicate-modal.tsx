import type { DivProps } from "@powerhousedao/design-system";
import { Icon } from "@powerhousedao/design-system";
import type { ComponentPropsWithoutRef } from "react";
import { twMerge } from "tailwind-merge";
import { Modal } from "../../../powerhouse/components/modal/modal.js";
import { mergeClassNameProps } from "../../../powerhouse/utils/mergeClassNameProps.js";

const buttonStyles =
  "min-h-[48px] min-w-[142px] text-base font-semibold py-3 px-6 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all";

type ButtonProps = ComponentPropsWithoutRef<"button">;

export type ConnectReplaceDuplicateModalProps = ComponentPropsWithoutRef<
  typeof Modal
> & {
  readonly title?: string;
  readonly fileName?: string;
  readonly message?: string;
  readonly onReplace: () => void;
  readonly onDuplicate: () => void;
  readonly replaceLabel?: string;
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
    onReplace,
    onOpenChange,
    onDuplicate,
    replaceLabel = "Replace",
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
        {...mergeClassNameProps(containerProps, "w-[450px] p-6 text-slate-300")}
      >
        <div className="flex items-center justify-between border-b border-slate-50 pb-2">
          <div
            {...mergeClassNameProps(
              headerProps,
              "text-2xl font-bold text-gray-800",
            )}
          >
            {title}
          </div>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded-md outline-none hover:bg-slate-100"
            onClick={() => onOpenChange?.(false)}
          >
            <Icon name="XmarkLight" size={24} />
          </button>
        </div>
        <div
          {...mergeClassNameProps(
            bodyProps,
            "my-6 rounded-md bg-slate-50 p-4 text-center",
          )}
        >
          {message || defaultMessage}
          {children}
        </div>
        <div
          {...mergeClassNameProps(
            buttonContainerProps,
            "mt-8 flex justify-between gap-3",
          )}
        >
          <button
            onClick={onReplace}
            {...mergeClassNameProps(
              replaceButtonProps,
              twMerge(buttonStyles, "flex-1 bg-slate-50 text-slate-800"),
            )}
          >
            {replaceLabel}
          </button>
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
