import {
    AddRemoteDriveForm,
    AddRemoteDriveInput,
    Divider,
    SharingType,
} from '@/connect';
import { DivProps, Icon, Modal } from '@/powerhouse';
import { ComponentPropsWithoutRef } from 'react';
import { twMerge } from 'tailwind-merge';

type ModalProps = ComponentPropsWithoutRef<typeof Modal>;
export type AddRemoteDriveModal = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: AddRemoteDriveInput) => void;
    sharingType: SharingType;
    modalProps?: ModalProps;
    containerProps?: DivProps;
};
export function AddRemoteDriveModal(props: AddRemoteDriveModal) {
    const {
        open,
        onOpenChange,
        onSubmit,
        sharingType,
        modalProps,
        containerProps,
    } = props;
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
                    'min-w-[408px] max-w-[408px] rounded-2xl p-6',
                    containerProps?.className,
                )}
            >
                <div className="flex justify-between">
                    <h1 className="text-xl font-bold">Add drive</h1>
                    <button
                        className="flex size-8 items-center justify-center rounded-md bg-gray-100 text-gray-500 outline-none hover:text-gray-900"
                        onClick={handleCancel}
                        tabIndex={-1}
                    >
                        <Icon name="xmark-light" size={24} />
                    </button>
                </div>
                <Divider className="my-4" />
                <AddRemoteDriveForm
                    sharingType={sharingType}
                    onSubmit={onSubmit}
                    onCancel={handleCancel}
                />
            </div>
        </Modal>
    );
}
