import {
    AddLocalDriveInput,
    AddRemoteDriveInput,
    AddDriveModal as ConnectAddLocalDriveModal,
} from '@powerhousedao/design-system';
import { requestPublicDrive } from 'document-drive/utils/graphql';
import { CommonPackage, useApps } from 'src/store/external-packages';
type Props = {
    open: boolean;
    onAddLocalDrive: (data: AddLocalDriveInput) => Promise<void>;
    onAddRemoteDrive: (data: AddRemoteDriveInput) => Promise<void>;
    onClose: () => void;
};

export function AddDriveModal(props: Props) {
    const { open, onAddLocalDrive, onAddRemoteDrive, onClose } = props;

    const apps = useApps();

    async function onAddLocalDriveSubmit(data: AddLocalDriveInput) {
        const appId = typeof data.app === 'string' ? data.app : data.app.id;
        const app = apps.find(app => app.id === appId) ?? CommonPackage;
        console.log('onAddLocalDriveSubmit', data.app, app);
        await onAddLocalDrive({ ...data, app });
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
            requestPublicDrive={requestPublicDrive}
            onOpenChange={status => {
                if (!status) return onClose();
            }}
            appOptions={apps}
        />
    );
}
