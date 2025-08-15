import {
    type AddRemoteDriveInput,
    AddRemoteDriveModal as ConnectAddRemoteDriveModal,
} from '@powerhousedao/design-system';
import { requestPublicDrive, type SharingType } from 'document-drive';

type Props = {
    open: boolean;
    groupSharingType: SharingType;
    onAddRemoteDrive: (data: AddRemoteDriveInput) => Promise<void>;
    onClose: () => void;
};

export function AddRemoteDriveModal(props: Props) {
    const { open, groupSharingType, onAddRemoteDrive, onClose } = props;

    async function onSubmit(data: AddRemoteDriveInput) {
        await onAddRemoteDrive(data);
        onClose();
    }

    return (
        <ConnectAddRemoteDriveModal
            open={open}
            onSubmit={onSubmit}
            sharingType={groupSharingType}
            onOpenChange={status => {
                if (!status) return onClose();
            }}
            requestPublicDrive={requestPublicDrive}
        />
    );
}
