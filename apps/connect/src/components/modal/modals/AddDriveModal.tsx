import { useConnectCrypto } from '#hooks';
import { useApps } from '#store';
import {
    type AddLocalDriveInput,
    type AddRemoteDriveInput,
    AddDriveModal as ConnectAddLocalDriveModal,
} from '@powerhousedao/design-system';
import { requestPublicDrive } from 'document-drive';
type Props = {
    open: boolean;
    onAddLocalDrive: (data: AddLocalDriveInput) => Promise<void>;
    onAddRemoteDrive: (data: AddRemoteDriveInput) => Promise<void>;
    onClose: () => void;
};

export function AddDriveModal(props: Props) {
    const { open, onAddLocalDrive, onAddRemoteDrive, onClose } = props;

    const apps = useApps();
    const { getBearerToken } = useConnectCrypto();

    async function onAddLocalDriveSubmit(data: AddLocalDriveInput) {
        await onAddLocalDrive(data);
        onClose();
    }

    async function onAddRemoteDriveSubmit(data: AddRemoteDriveInput) {
        await onAddRemoteDrive(data);
        onClose();
    }

    return (
        <ConnectAddLocalDriveModal
            open={open}
            onAddLocalDrive={onAddLocalDriveSubmit}
            onAddRemoteDrive={onAddRemoteDriveSubmit}
            requestPublicDrive={async (url: string) => {
                const authToken = await getBearerToken(url);
                return requestPublicDrive(url, {
                    Authorization: `Bearer ${authToken}`,
                });
            }}
            onOpenChange={status => {
                if (!status) return onClose();
            }}
            appOptions={apps}
            authToken={'test'}
        />
    );
}
