import {
    type AddLocalDriveInput,
    type AddRemoteDriveInput,
    AddDriveModal as ConnectAddLocalDriveModal,
} from '@powerhousedao/design-system';
import {
    useConnectCrypto,
    useDriveEditorModules,
    useUser,
} from '@powerhousedao/reactor-browser';
import { requestPublicDrive } from 'document-drive';
type Props = {
    open: boolean;
    onAddLocalDrive: (data: AddLocalDriveInput) => Promise<void>;
    onAddRemoteDrive: (data: AddRemoteDriveInput) => Promise<void>;
    onClose: () => void;
};

export function AddDriveModal(props: Props) {
    const { open, onAddLocalDrive, onAddRemoteDrive, onClose } = props;
    const user = useUser();
    const driveEditorModules = useDriveEditorModules();
    const connectCrypto = useConnectCrypto();

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
                try {
                    const authToken = await connectCrypto?.getBearerToken?.(
                        url,
                        user?.address,
                        false,
                        60 * 10,
                    );
                    return requestPublicDrive(url, {
                        Authorization: `Bearer ${authToken}`,
                    });
                } catch (error) {
                    console.error(error);
                    const authToken = await connectCrypto?.getBearerToken?.(
                        url,
                        user?.address,
                        false,
                        60 * 10,
                    );
                    return requestPublicDrive(url, {
                        Authorization: `Bearer ${authToken}`,
                    });
                }
            }}
            onOpenChange={status => {
                if (!status) return onClose();
            }}
            appOptions={
                driveEditorModules?.map(pkg => ({
                    id: pkg.id,
                    name: pkg.name,
                    driveEditor: pkg.id,
                })) || []
            }
        />
    );
}
