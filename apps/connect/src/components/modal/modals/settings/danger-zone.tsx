import { useDocumentDriveServer } from '#hooks';
import { DangerZone as BaseDangerZone } from '@powerhousedao/design-system';
import { useUnwrappedDrives } from '@powerhousedao/state';
import { type DocumentDriveDocument, logger } from 'document-drive';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useModal } from '../../modal.js';

export const DangerZone: React.FC<{ onRefresh: () => void }> = ({
    onRefresh,
}) => {
    const { t } = useTranslation();
    const { clearStorage, deleteDrive } = useDocumentDriveServer();
    const drives = useUnwrappedDrives();
    const { showModal } = useModal();
    const navigate = useNavigate();

    const handleDeleteDrive = useCallback(
        async (drive: DocumentDriveDocument) => {
            navigate('/');
            await deleteDrive(drive.header.id);
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
            drives={drives ?? []}
            onDeleteDrive={handleDeleteDrive}
            onClearStorage={handleClearStorage}
        />
    );
};
