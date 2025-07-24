import { useDocumentDriveServer } from '#hooks';
import { DangerZone as BaseDangerZone } from '@powerhousedao/design-system';
import {
    useSetSelectedDrive,
    useSetSelectedNode,
    useUnwrappedDrives,
} from '@powerhousedao/state';
import { type DocumentDriveDocument, logger } from 'document-drive';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useModal } from '../../modal.js';

export const DangerZone: React.FC<{ onRefresh: () => void }> = ({
    onRefresh,
}) => {
    const { t } = useTranslation();
    const { clearStorage, deleteDrive } = useDocumentDriveServer();
    const drives = useUnwrappedDrives();
    const setSelectedDrive = useSetSelectedDrive();
    const setSelectedNode = useSetSelectedNode();
    const { showModal } = useModal();

    const handleDeleteDrive = useCallback(
        async (drive: DocumentDriveDocument) => {
            setSelectedDrive(undefined);
            await deleteDrive(drive.header.id);
        },
        [deleteDrive, setSelectedDrive],
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
                        setSelectedDrive(undefined);
                        setSelectedNode(undefined);
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
