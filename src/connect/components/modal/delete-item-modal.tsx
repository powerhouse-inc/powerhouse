import { Modal } from '@/powerhouse';
import React, { ComponentPropsWithoutRef } from 'react';
import { Button } from 'react-aria-components';
import { twMerge } from 'tailwind-merge';

const buttonStyles =
    'min-h-[48px] min-w-[142px] text-base font-semibold py-3 px-6 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all';

export type ConnectDeleteItemModalProps = ComponentPropsWithoutRef<
    typeof Modal
> & {
    header: React.ReactNode;
    body: React.ReactNode;
    onDelete: () => void;
    cancelLabel: string;
    deleteLabel: string;
};

export const ConnectDeleteItemModal = (props: ConnectDeleteItemModalProps) => {
    const {
        body,
        header,
        onOpenChange,
        onDelete,
        cancelLabel,
        deleteLabel,
        overlayProps,
        contentProps,
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
                className: twMerge('rounded-3xl', contentProps?.className),
            }}
            onOpenChange={onOpenChange}
            {...restProps}
        >
            <div className="w-[465px] px-8 py-12 text-slate-300">
                <div className="text-center text-2xl font-semibold">
                    {header}
                </div>
                <div className="mt-8 text-center text-xl">{body}</div>
                <div className="mt-8 flex justify-center gap-3">
                    <Button
                        onPress={() => onOpenChange?.(false)}
                        className={twMerge(
                            buttonStyles,
                            'bg-grey-600/75 text-slate-700',
                        )}
                    >
                        {cancelLabel}
                    </Button>
                    <Button
                        onPress={onDelete}
                        className={twMerge(
                            buttonStyles,
                            'bg-red-900 text-grey-50',
                        )}
                    >
                        {deleteLabel}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
