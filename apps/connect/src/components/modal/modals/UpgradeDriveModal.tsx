import { useModal } from '@powerhousedao/common';
import { ConnectUpgradeDriveModal } from '@powerhousedao/design-system';
import type React from 'react';
import { useTranslation } from 'react-i18next';

export const UpgradeDriveModal: React.FC = () => {
    const { isOpen, props, hide } = useModal('upgradeDrive');
    const { driveId } = props;
    const { t } = useTranslation();

    const onContinue = () => {
        // TODO: Implement upgrade drive
        console.log('Upgrade drive: ', driveId);
        hide();
    };

    if (!isOpen) return null;

    return (
        <ConnectUpgradeDriveModal
            open={isOpen}
            onContinue={onContinue}
            header={t('modals.upgradeDrive.header')}
            body={t('modals.upgradeDrive.body')}
            cancelLabel={t('common.cancel')}
            continueLabel={t('common.continue')}
            onOpenChange={(status: boolean) => {
                if (!status) return hide();
            }}
        />
    );
};
