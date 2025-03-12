import { useDocumentDriveServer, useUiNodes } from '#hooks';
import {
    DangerZone as BaseDangerZone,
    type UiDriveNode,
} from '@powerhousedao/design-system';
import { logger } from 'document-drive';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useModal } from '../../modal.js';

export const DangerZone: React.FC<{ onRefresh: () => void }> = ({
    onRefresh,
}) => {
    const { t } = useTranslation();
    const { clearStorage } = useDocumentDriveServer();
    const { driveNodes, deleteDrive } = useUiNodes();
    const { showModal } = useModal();

    const handleDeleteDrive = useCallback(
        (drive: UiDriveNode) => deleteDrive(drive.driveId),
        [deleteDrive],
    );

    const handleClearStorage = () => {
        showModal('confirmationModal', {
            title: t('modals.connectSettings.clearStorage.confirmation.title'),
            body: t('modals.connectSettings.clearStorage.confirmation.body'),
            cancelLabel: t('common.cancel'),
            continueLabel: t(
                'modals.connectSettings.clearStorage.confirmation.clearButton',
            ),
            onContinue: () => {
                clearStorage()
                    .then(() => {
                        // refreshes the page to reload default drive
                        onRefresh();
                    })
                    .catch(logger.error);
            },
            onCancel: () => showModal('settingsModal', { onRefresh }),
        });
    };

    return (
        <BaseDangerZone
            drives={driveNodes}
            onDeleteDrive={handleDeleteDrive}
            onClearStorage={handleClearStorage}
        />
    );
};
