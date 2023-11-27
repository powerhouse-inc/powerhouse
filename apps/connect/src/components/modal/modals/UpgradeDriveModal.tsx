import { ConnectUpgradeDriveModal } from '@powerhousedao/design-system';
import React from 'react';
import { useTranslation } from 'react-i18next';

export interface UpgradeDriveModalProps {
    open: boolean;
    onClose: () => void;
    driveId: string;
}

export const UpgradeDriveModal: React.FC<UpgradeDriveModalProps> = props => {
    const { open, onClose, driveId } = props;

    const { t } = useTranslation();

    const onContinue = () => {
        // TODO: Implement upgrade drive
        console.log('Upgrade drive: ', driveId);
        onClose();
    };

    return (
        <ConnectUpgradeDriveModal
            open={open}
            onClose={onClose}
            onContinue={onContinue}
            header={t('modals.upgradeDrive.header')}
            body={t('modals.upgradeDrive.body')}
            cancelLabel={t('common.cancel')}
            continueLabel={t('common.continue')}
        />
    );
};
