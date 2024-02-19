import { Modal, TextInput } from '@/powerhouse';
import React, { ComponentPropsWithoutRef, useState } from 'react';
import { Button } from 'react-aria-components';
import { twMerge } from 'tailwind-merge';

const buttonStyles =
    'min-h-[48px] min-w-[142px] text-base font-semibold py-3 px-6 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all';

export type RenameNodeModalProps = ComponentPropsWithoutRef<typeof Modal> & {
    header: React.ReactNode;
    onContinue: (nodeName: string) => void;
    cancelLabel: string;
    continueLabel: string;
    placeholder?: string;
};

export const RenameNodeModal = (props: RenameNodeModalProps) => {
    const {
        header,
        onOpenChange,
        onContinue,
        cancelLabel,
        continueLabel,
        overlayProps,
        contentProps,
        placeholder,
        ...restProps
    } = props;

    const [nodeName, setNodeName] = useState('');

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
            <div className="w-[400px] p-6 text-slate-300">
                <div className="border-b border-slate-50 pb-2 text-2xl font-bold text-gray-800">
                    {header}
                </div>
                <div className="my-6 rounded-md bg-slate-50 p-2 text-center">
                    <TextInput
                        inputProps={{ placeholder }}
                        onChange={val => setNodeName(val)}
                    />
                </div>
                <div className="mt-8 flex justify-between gap-3">
                    <Button
                        onPress={() => onOpenChange?.(false)}
                        className={twMerge(
                            buttonStyles,
                            'flex-1 bg-slate-50 text-slate-800',
                        )}
                    >
                        {cancelLabel}
                    </Button>
                    <Button
                        onPress={() => onContinue(nodeName)}
                        className={twMerge(
                            buttonStyles,
                            'flex-1 bg-gray-800 text-gray-50',
                        )}
                    >
                        {continueLabel}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
