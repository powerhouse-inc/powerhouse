import { Button, Icon, Modal } from "#powerhouse";
import { type ComponentPropsWithoutRef } from "react";

import { twMerge } from "tailwind-merge";

export type SettingsModalOldProps = ComponentPropsWithoutRef<typeof Modal> & {
  readonly title: React.ReactNode;
  readonly body: React.ReactNode;
  readonly cancelLabel: string;
  readonly saveLabel: string;
  readonly onSave: () => void;
};

export const SettingsModalOld: React.FC<SettingsModalOldProps> = (props) => {
  const {
    body,
    title,
    onSave,
    children,
    saveLabel,
    cancelLabel,
    overlayProps,
    contentProps,
    onOpenChange,
    ...restProps
  } = props;

  return (
    <Modal
      contentProps={{
        ...contentProps,
        className: twMerge("rounded-2xl", contentProps?.className),
      }}
      onOpenChange={onOpenChange}
      overlayProps={{
        ...overlayProps,
        className: twMerge("top-10", overlayProps?.className),
      }}
      {...restProps}
    >
      <div className="w-[432px] p-4 text-gray-900">
        <div className="flex justify-between">
          <h1 className="text-center text-xl font-bold">{title}</h1>
          <button
            className="flex size-8 items-center justify-center rounded-md bg-gray-100 text-gray-500 outline-none hover:text-gray-900"
            onClick={() => onOpenChange?.(false)}
          >
            <Icon name="XmarkLight" size={24} />
          </button>
        </div>
        <div className="mt-8 flex min-h-[50px] items-center justify-center rounded-md bg-slate-50 p-3 text-xs font-medium text-gray-600">
          {body}
        </div>
        <div className="mt-4 flex flex-col gap-y-4">{children}</div>
        <div className="mt-4 flex justify-end gap-x-4">
          <Button
            className="text-gray-900"
            color="light"
            onClick={() => onOpenChange?.(false)}
          >
            {cancelLabel}
          </Button>
          <Button onClick={onSave}>{saveLabel}</Button>
        </div>
      </div>
    </Modal>
  );
};
