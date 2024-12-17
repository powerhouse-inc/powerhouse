import {
    AddLocalDriveInput,
    AddLocalDriveModal as ConnectAddLocalDriveModal,
} from '@powerhousedao/design-system';

type Props = {
    open: boolean;
    onAddLocalDrive: (data: AddLocalDriveInput) => Promise<void>;
    onClose: () => void;
};

export function AddLocalDriveModal(props: Props) {
    const { open, onAddLocalDrive, onClose } = props;

    async function onSubmit(data: AddLocalDriveInput) {
        await onAddLocalDrive(data);
        onClose();
    }

    return (
        <ConnectAddLocalDriveModal
            open={open}
            onSubmit={onSubmit}
            onOpenChange={status => {
                if (!status) return onClose();
            }}
        />
    );
}
