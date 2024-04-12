import {
    Button,
    ClearStorageSettingsRow,
    SettingsModal as ConnectSettingsModal,
    DocumentSelectSettingsRow,
} from '@powerhousedao/design-system';
import { DocumentModel } from 'document-model/document';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Option } from 'react-multi-select-component';
import { useModal } from 'src/components/modal';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useFeatureFlag } from 'src/hooks/useFeatureFlags';
import { useLogin } from 'src/hooks/useLogin';
import {
    useDocumentModels,
    useFilteredDocumentModels,
} from 'src/store/document-model';
import { useUser } from 'src/store/user';
import { Login } from '../../login';

const mapDocumentModelsToOptions = (documentModels: DocumentModel[]) =>
    documentModels.map(document => ({
        label: document.documentModel.name,
        value: document.documentModel.id,
    }));

export interface SettingsModalProps {
    open: boolean;
    onClose: () => void;
    onRefresh: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = props => {
    const { open, onClose, onRefresh } = props;
    const { clearStorage } = useDocumentDriveServer();
    const { t } = useTranslation();
    const enabledDocuments = useFilteredDocumentModels();
    const documentModels = useDocumentModels();
    const { setConfig } = useFeatureFlag();
    const { showModal } = useModal();
    const [selectedDocuments, setSelectedDocuments] = useState<Option[]>(
        mapDocumentModelsToOptions(enabledDocuments),
    );
    const { logout, status } = useLogin();
    const user = useUser();

    const onSaveHandler = () => {
        setConfig(conf => ({
            ...conf,
            editors: {
                enabledEditors: selectedDocuments.map(
                    doc => doc.value as string,
                ),
            },
        }));

        onClose();
    };

    const onClearStorage = () => {
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
                        // resets the default drive to unloaded if it is defined
                        setConfig(conf => ({
                            ...conf,
                            defaultDrive: conf.defaultDrive
                                ? { ...conf.defaultDrive, loaded: false }
                                : undefined,
                        }));

                        // refreshes the page to reload default drive
                        onRefresh();
                    })
                    .catch(console.error);
            },
            onCancel: () => showModal('settingsModal', { onRefresh }),
        });
    };

    return (
        <ConnectSettingsModal
            open={open}
            title={t('modals.connectSettings.title')}
            body={t('modals.connectSettings.body')}
            cancelLabel={t('common.cancel')}
            saveLabel={t('common.save')}
            onSave={onSaveHandler}
            onOpenChange={status => {
                if (!status) return onClose();
            }}
        >
            <div className="rounded border border-gray-400 p-4">
                {status === 'authorized' ? (
                    <>
                        <p>
                            Logged in with address:{' '}
                            <span className="text-sm font-semibold">
                                {user?.address}
                            </span>
                        </p>
                        <Button className="mt-2 w-full" onClick={logout}>
                            Logout
                        </Button>
                    </>
                ) : (
                    <Login />
                )}
            </div>
            <DocumentSelectSettingsRow
                selected={selectedDocuments}
                onChange={selectedDocs => setSelectedDocuments(selectedDocs)}
                options={mapDocumentModelsToOptions(documentModels)}
                title={t('modals.connectSettings.enabledDocumentTypes.title')}
                description={t(
                    'modals.connectSettings.enabledDocumentTypes.description',
                )}
                selectProps={{
                    overrideStrings: {
                        allItemsAreSelected: t(
                            'modals.connectSettings.enabledDocumentTypes.allSelected',
                        ),
                    },
                }}
            />
            <ClearStorageSettingsRow
                onClearStorage={onClearStorage}
                buttonLabel={t('modals.connectSettings.clearStorage.button')}
                description={t(
                    'modals.connectSettings.clearStorage.description',
                )}
            />
        </ConnectSettingsModal>
    );
};
