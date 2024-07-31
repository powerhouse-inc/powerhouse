import { Button, Icon, Modal } from '@/powerhouse';
import React, { ComponentPropsWithoutRef } from 'react';
import { twMerge } from 'tailwind-merge';

export type SettingsModalProps = ComponentPropsWithoutRef<typeof Modal> & {
    title: React.ReactNode;
    body: React.ReactNode;
    cancelLabel: string;
    saveLabel: string;
    onSave: () => void;
};

export const SettingsModal: React.FC<SettingsModalProps> = props => {
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
            overlayProps={{
                ...overlayProps,
                className: twMerge('top-10', overlayProps?.className),
            }}
            contentProps={{
                ...contentProps,
                className: twMerge('rounded-2xl', contentProps?.className),
            }}
            onOpenChange={onOpenChange}
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
                        color="light"
                        className="text-gray-900"
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
