import {
    ConfirmationModalProps,
    ConnectConfirmationModal,
} from './confirmation-modal';

export interface ConnectDeleteItemModalProps
    extends Omit<ConfirmationModalProps, 'onContinue' | 'continueLabel'> {
    onDelete: () => void;
    deleteLabel: string;
}

export const ConnectDeleteItemModal = (props: ConnectDeleteItemModalProps) => {
    const { onDelete, deleteLabel, ...restProps } = props;

    return (
        <ConnectConfirmationModal
            {...restProps}
            containerProps={{ className: 'w-[450px]' }}
            continueButtonProps={{
                className: 'bg-red-900',
            }}
            onContinue={onDelete}
            continueLabel={deleteLabel}
        />
    );
};
