import {
    AddRemoteDriveInput,
    AddRemoteDriveModal as ConnectAddRemoteDriveModal,
    SharingType,
} from '@powerhousedao/design-system';

type Props = {
    open: boolean;
    onSubmit: (data: AddRemoteDriveInput) => void;
    onClose: () => void;
    sharingType: SharingType;
};

export function AddRemoteDriveModal(props: Props) {
    const { open, onSubmit, onClose, sharingType } = props;

    return (
        <ConnectAddRemoteDriveModal
            open={open}
            onSubmit={onSubmit}
            sharingType={sharingType}
            onOpenChange={status => {
                if (!status) return onClose();
            }}
        />
    );
}
