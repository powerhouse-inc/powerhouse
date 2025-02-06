import { ConnectConfirmationModal } from '@powerhousedao/design-system';
import React from 'react';

export interface ConfirmationModalProps {
    body: React.ReactNode;
    open: boolean;
    title: string;
    cancelLabel: string;
    onClose: () => void;
    continueLabel: string;
    onContinue: (closeModal: () => void) => void;
    onCancel: (closeModal: () => void) => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = props => {
    const {
        open,
        onClose,
        onCancel,
        title,
        body,
        cancelLabel,
        continueLabel,
        onContinue,
    } = props;

    return (
        <ConnectConfirmationModal
            open={open}
            onCancel={() => onCancel(onClose)}
            header={title}
            body={body}
            cancelLabel={cancelLabel}
            continueLabel={continueLabel}
            onContinue={() => onContinue(onClose)}
            onOpenChange={status => {
                if (!status) return onClose();
            }}
        />
    );
};
