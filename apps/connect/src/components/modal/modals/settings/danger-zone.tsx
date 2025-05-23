import { useDocumentDriveServer } from '#hooks';
import {
    DangerZone as BaseDangerZone,
    type UiDriveNode,
} from '@powerhousedao/design-system';
import { useUiNodesContext } from '@powerhousedao/reactor-browser';
import { logger } from 'document-drive';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useModal } from '../../modal.js';

export const DangerZone: React.FC<{ onRefresh: () => void }> = ({
    onRefresh,
}) => {
    const { t } = useTranslation();
    const { clearStorage, deleteDrive } = useDocumentDriveServer();
    const { driveNodes } = useUiNodesContext();
    const { showModal } = useModal();
    const navigate = useNavigate();

    const handleDeleteDrive = useCallback(
        async (drive: UiDriveNode) => {
            navigate('/');
            await deleteDrive(drive.driveId);
        },
        [deleteDrive, navigate],
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
                        navigate('/');
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
