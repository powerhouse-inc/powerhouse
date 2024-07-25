import { AddLocalDriveForm, AddLocalDriveInput, Divider } from '@/connect';
import { DivProps, Icon, Modal } from '@/powerhouse';
import { ComponentPropsWithoutRef } from 'react';
import { twMerge } from 'tailwind-merge';

type ModalProps = ComponentPropsWithoutRef<typeof Modal>;
export type AddLocalDriveModal = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: AddLocalDriveInput) => void;
    modalProps?: ModalProps;
    containerProps?: DivProps;
};
export function AddLocalDriveModal(props: AddLocalDriveModal) {
    const { open, onOpenChange, onSubmit, modalProps, containerProps } = props;
    function handleCancel() {
        onOpenChange(false);
    }
    return (
        <Modal
            {...modalProps}
            open={open}
            onOpenChange={onOpenChange}
            contentProps={{
                className: 'rounded-2xl',
            }}
        >
            <div
                {...containerProps}
                className={twMerge(
                    'max-w-[408px] rounded-2xl p-6',
                    containerProps?.className,
                )}
            >
                <div className="flex justify-between">
                    <h1 className="text-xl font-bold">Create new drive </h1>
                    <button
                        className="flex size-8 items-center justify-center rounded-md bg-gray-100 text-gray-500 outline-none hover:text-gray-900"
                        onClick={handleCancel}
                        tabIndex={-1}
                    >
                        <Icon name="xmark-light" size={24} />
                    </button>
                </div>
                <Divider className="my-4" />
                <AddLocalDriveForm
                    onSubmit={onSubmit}
                    onCancel={handleCancel}
                />
            </div>
        </Modal>
    );
}
