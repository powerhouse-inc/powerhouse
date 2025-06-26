import { useDocumentDriveServer } from '#hooks';
import { useModal } from '@powerhousedao/common';
import { ConnectConfirmationModal } from '@powerhousedao/design-system';
import { logger } from 'document-drive';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

export function ClearStorageModal() {
    const { t } = useTranslation();
    const { clearStorage } = useDocumentDriveServer();
    const navigate = useNavigate();
    const { isOpen, hide } = useModal('clearStorage');
    const { show: showSettingsModal } = useModal('settings');

    if (!isOpen) return null;

    return (
        <ConnectConfirmationModal
            header={'modals.connectSettings.clearStorage.confirmation.title'}
            title={'modals.connectSettings.clearStorage.confirmation.title'}
            body={t('modals.connectSettings.clearStorage.confirmation.body')}
            cancelLabel={t('common.cancel')}
            continueLabel={t(
                'modals.connectSettings.clearStorage.confirmation.clearButton',
            )}
            onCancel={showSettingsModal}
            onContinue={() => {
                clearStorage()
                    .then(() => {
                        hide();
                        navigate('/');
                    })
                    .catch(logger.error);
            }}
        />
    );
}
