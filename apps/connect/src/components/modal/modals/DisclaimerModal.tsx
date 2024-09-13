import { ReadRequiredModal } from '@powerhousedao/design-system';
import React from 'react';
import { useTranslation } from 'react-i18next';

export interface DisclaimerModalProps {
    open: boolean;
    onClose: () => void;
}

export const DisclaimerModal: React.FC<DisclaimerModalProps> = props => {
    const { open, onClose } = props;

    const { t } = useTranslation();

    return (
        <ReadRequiredModal
            open={open}
            header={t('modals.disclaimer.title')}
            body={t('modals.disclaimer.body')}
            closeLabel="Close"
            onContinue={() => onClose()}
        />
    );
};
