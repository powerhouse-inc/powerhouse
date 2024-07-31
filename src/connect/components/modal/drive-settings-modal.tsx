import {
    Divider,
    DriveSettingsForm,
    DriveSettingsFormSubmitHandler,
    SharingType,
    UiDriveNode,
} from '@/connect';
import { DivProps, Icon, Modal } from '@/powerhouse';
import { ComponentPropsWithoutRef } from 'react';
import { twMerge } from 'tailwind-merge';

type ModalProps = ComponentPropsWithoutRef<typeof Modal>;

export type DriveSettingsModalProps = {
    uiDriveNode: UiDriveNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRenameDrive: (uiDriveNode: UiDriveNode, newName: string) => void;
    onDeleteDrive: (uiDriveNode: UiDriveNode) => void;
    onChangeSharingType: (
        uiDriveNode: UiDriveNode,
        newSharingType: SharingType,
    ) => void;
    onChangeAvailableOffline: (
        uiDriveNode: UiDriveNode,
        newAvailableOffline: boolean,
    ) => void;
    modalProps?: ModalProps;
    containerProps?: DivProps;
};
export function DriveSettingsModal(props: DriveSettingsModalProps) {
    const {
        uiDriveNode,
        open,
        onOpenChange,
        onDeleteDrive,
        onRenameDrive,
        onChangeSharingType,
        onChangeAvailableOffline,
        modalProps,
        containerProps,
    } = props;

    const onSubmit: DriveSettingsFormSubmitHandler = data => {
        if (data.name !== uiDriveNode.name) {
            onRenameDrive(uiDriveNode, data.name);
        }
        if (data.sharingType !== uiDriveNode.sharingType) {
            onChangeSharingType(uiDriveNode, data.sharingType);
        }
        if (data.availableOffline !== uiDriveNode.availableOffline) {
            onChangeAvailableOffline(uiDriveNode, data.availableOffline);
        }
        onOpenChange(false);
    };

    function handleDeleteDrive() {
        onDeleteDrive(uiDriveNode);
        onOpenChange(false);
    }

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
                    <h1 className="text-xl font-bold">Drive settings</h1>
                    <button
                        className="flex size-8 items-center justify-center rounded-md bg-gray-100 text-gray-500 outline-none hover:text-gray-900"
                        onClick={handleCancel}
                        tabIndex={-1}
                    >
                        <Icon name="XmarkLight" size={24} />
                    </button>
                </div>
                <Divider className="my-4" />
                <DriveSettingsForm
                    uiDriveNode={uiDriveNode}
                    onSubmit={onSubmit}
                    handleDeleteDrive={handleDeleteDrive}
                    handleCancel={handleCancel}
                />
            </div>
        </Modal>
    );
}
