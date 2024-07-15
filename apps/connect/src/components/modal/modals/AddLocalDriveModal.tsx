import {
    AddLocalDriveInput,
    AddLocalDriveModal as ConnectAddLocalDriveModal,
} from '@powerhousedao/design-system';

type Props = {
    open: boolean;
    onSubmit: (data: AddLocalDriveInput) => void;
    onClose: () => void;
};

export function AddLocalDriveModal(props: Props) {
    const { open, onSubmit, onClose } = props;

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
