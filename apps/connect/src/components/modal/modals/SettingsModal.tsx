import {
    Button,
    ClearStorageSettingsRow,
    Combobox,
    SettingsModal as ConnectSettingsModal,
    DependencyVersions,
    DocumentSelectSettingsRow,
} from '@powerhousedao/design-system';
import { DocumentModel } from 'document-model/document';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModal } from 'src/components/modal';
import PackagesManager from 'src/components/packages-manager';
import { useConnectConfig } from 'src/hooks/useConnectConfig';
import { useDefaultDocumentModelEditor } from 'src/hooks/useDefaultDocumentModelEditor';
import { DefaultDocumentModelEditor } from 'src/hooks/useDefaultDocumentModelEditor/atom';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useFeatureFlag } from 'src/hooks/useFeatureFlags';
import { useLogin } from 'src/hooks/useLogin';
import { logger } from 'src/services/logger';
import {
    useDocumentModels,
    useFilteredDocumentModels,
} from 'src/store/document-model';
import { useUser } from 'src/store/user';
import packageJson from '../../../../package.json';
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
    const [connectConfig] = useConnectConfig();
    const [documentModelEditor, setDocumentModelEditor] =
        useDefaultDocumentModelEditor();
    const [selectedDocuments, setSelectedDocuments] = useState(
        mapDocumentModelsToOptions(enabledDocuments),
    );
    const { logout, status } = useLogin();
    const user = useUser();

    const onSaveHandler = () => {
        setConfig(conf => ({
            ...conf,
            editors: {
                enabledEditors: selectedDocuments.map(doc => doc.value),
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
                        // refreshes the page to reload default drive
                        onRefresh();
                    })
                    .catch(logger.error);
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
            <PackagesManager />
            {connectConfig.content.showDocumentModelSelectionSetting && (
                <DocumentSelectSettingsRow
                    selected={selectedDocuments}
                    onChange={selectedDocs =>
                        setSelectedDocuments(selectedDocs)
                    }
                    options={mapDocumentModelsToOptions(documentModels)}
                    title={t(
                        'modals.connectSettings.enabledDocumentTypes.title',
                    )}
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
            )}
            <ClearStorageSettingsRow
                onClearStorage={onClearStorage}
                buttonLabel={t('modals.connectSettings.clearStorage.button')}
                description={t(
                    'modals.connectSettings.clearStorage.description',
                )}
            />
            <div>
                <label
                    htmlFor="default-document-model-editor"
                    className="text-sm"
                >
                    Default Document Model Editor:
                </label>
                <Combobox
                    id="default-document-model-editor"
                    value={documentModelEditor}
                    onChange={value =>
                        setDocumentModelEditor(
                            value as DefaultDocumentModelEditor,
                        )
                    }
                    options={[
                        { label: 'V1', value: 'document-model-editor' },
                        { label: 'V2', value: 'document-model-editor-v2' },
                    ]}
                />
            </div>
            <DependencyVersions packageJson={packageJson} />
        </ConnectSettingsModal>
    );
};
