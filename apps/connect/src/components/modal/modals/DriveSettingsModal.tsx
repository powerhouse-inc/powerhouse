import {
    DriveSettingsModal as ConnectDriveSettingsModal,
    SharingType,
    UiDriveNode,
} from '@powerhousedao/design-system';

type Props = {
    uiDriveNode: UiDriveNode;
    open: boolean;
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
    onClose: () => void;
};

export function DriveSettingsModal(props: Props) {
    const {
        uiDriveNode,
        open,
        onRenameDrive,
        onDeleteDrive,
        onChangeAvailableOffline,
        onChangeSharingType,
        onClose,
    } = props;

    return (
        <ConnectDriveSettingsModal
            uiDriveNode={uiDriveNode}
            open={open}
            onRenameDrive={onRenameDrive}
            onDeleteDrive={onDeleteDrive}
            onChangeAvailableOffline={onChangeAvailableOffline}
            onChangeSharingType={onChangeSharingType}
            onOpenChange={status => {
                if (!status) return onClose();
            }}
        />
    );
}
