import {
    type AddLocalDriveInput,
    AddLocalDriveModal as ConnectAddLocalDriveModal,
} from '@powerhousedao/design-system';
import { type App } from 'document-model';
type Props = {
    open: boolean;
    onAddLocalDrive: (data: AddLocalDriveInput) => Promise<void>;
    onClose: () => void;
    appOptions: App[];
};

export function AddLocalDriveModal(props: Props) {
    const { open, onAddLocalDrive, onClose, appOptions } = props;

    async function onSubmit(data: AddLocalDriveInput) {
        await onAddLocalDrive(data);
        onClose();
    }

    return (
        <ConnectAddLocalDriveModal
            open={open}
            onSubmit={onSubmit}
            appOptions={appOptions}
            onOpenChange={status => {
                if (!status) return onClose();
            }}
        />
    );
}
