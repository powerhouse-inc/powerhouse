import { useModal } from '@powerhousedao/common';
import { ReadRequiredModal } from '@powerhousedao/design-system';
import type React from 'react';
import { useTranslation } from 'react-i18next';

export const DisclaimerModal: React.FC = () => {
    const { isOpen, hide } = useModal('disclaimer');

    const { t } = useTranslation();

    if (!isOpen) return null;

    return (
        <ReadRequiredModal
            open={isOpen}
            header={t('modals.disclaimer.title')}
            body={t('modals.disclaimer.body')}
            closeLabel="Close"
            onContinue={hide}
        />
    );
};
