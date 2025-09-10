import { Modal } from "#powerhouse";
import type { ComponentPropsWithoutRef } from "react";

import { twMerge } from "tailwind-merge";

const buttonStyles =
  "min-h-[48px] min-w-[142px] text-base font-semibold py-3 px-6 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all";

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
      <div className="w-[400px] p-6 text-slate-300">
        <div className="border-b border-slate-50 pb-2 text-2xl font-bold text-gray-800">
          {header}
        </div>
        <div className="my-6 rounded-md bg-slate-50 p-4 text-center">
          {body}
        </div>
        <div className="mt-8 flex justify-between gap-3">
          <button
            className={twMerge(
              buttonStyles,
              "flex-1 bg-slate-50 text-slate-800",
            )}
            onClick={() => onOpenChange?.(false)}
          >
            {cancelLabel}
          </button>
          <button
            className={twMerge(buttonStyles, "flex-1 bg-gray-800 text-gray-50")}
            onClick={onContinue}
          >
            {continueLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
