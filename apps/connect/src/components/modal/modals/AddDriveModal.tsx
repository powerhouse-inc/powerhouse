import { CommonPackage, useApps } from '#store/external-packages';
import {
    AddLocalDriveInput,
    AddRemoteDriveInput,
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

    async function onAddLocalDriveSubmit(data: AddLocalDriveInput) {
        // TODO: Remove workaround after fixing app select component
        const appId =
            'appId' in data && typeof data.appId === 'string'
                ? data.appId
                : data.app.id;
        const app = apps.find(app => app.id === appId) ?? CommonPackage;
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
