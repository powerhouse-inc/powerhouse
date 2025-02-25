import { useDocumentDriveServer } from '#hooks/useDocumentDriveServer';
import { useUiNodes } from '#hooks/useUiNodes';
import { logger } from '#services/logger';
import {
    DangerZone as BaseDangerZone,
    UiDriveNode,
} from '@powerhousedao/design-system';
import { logger } from 'document-drive/logger';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useUiNodes } from 'src/hooks/useUiNodes';
import { useModal } from '../../modal';

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
