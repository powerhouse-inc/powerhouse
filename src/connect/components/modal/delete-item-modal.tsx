import { Modal, ModalProps } from '@/powerhouse/components/modal';
import React from 'react';
import { Button } from 'react-aria-components';
import { twMerge } from 'tailwind-merge';

const buttonStyles =
    'min-h-[48px] min-w-[142px] text-base font-semibold py-3 px-6 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all';

export interface ConnectDeleteItemModalProps extends ModalProps {
    header: React.ReactNode;
    body: React.ReactNode;
    onDelete: () => void;
    cancelLabel: string;
    deleteLabel: string;
}

export const ConnectDeleteItemModal = (props: ConnectDeleteItemModalProps) => {
    const {
        body,
        header,
        onClose,
        onDelete,
        cancelLabel,
        deleteLabel,
        modalProps = {},
        dialogProps = {},
        ...restProps
    } = props;

    const { className: modalClassName, ...restModalProps } = modalProps;
    const { className: dialogClassName, ...restDialogProps } = dialogProps;

    return (
        <Modal
            modalProps={{
                className: twMerge(
                    'top-10',
                    typeof modalClassName === 'string' && modalClassName,
                ),
                ...restModalProps,
            }}
            dialogProps={{
                className: twMerge('rounded-3xl', dialogClassName),
                ...restDialogProps,
            }}
            onClose={onClose}
            {...restProps}
        >
            <div className="w-[465px] px-8 py-12 text-[#565868]">
                <div className="text-center text-2xl font-semibold">
                    {header}
                </div>
                <div className="mt-8 text-center text-xl">{body}</div>
                <div className="mt-8 flex justify-center gap-3">
                    <Button
                        onPress={onClose}
                        className={twMerge(
                            buttonStyles,
                            'bg-[#E8ECEFBF] text-[#141718]',
                        )}
                    >
                        {cancelLabel}
                    </Button>
                    <Button
                        onPress={onDelete}
                        className={twMerge(
                            buttonStyles,
                            'bg-[#EA4335] text-[#FEFEFE]',
                        )}
                    >
                        {deleteLabel}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
