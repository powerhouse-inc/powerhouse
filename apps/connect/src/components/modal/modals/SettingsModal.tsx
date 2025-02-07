import {
    About,
    DangerZone,
    DefaultEditor,
    Icon,
    PackageManager,
    SettingsModal as SettingsModalV2,
    UiDriveNode,
} from '@powerhousedao/design-system';
import CommonManifest from 'document-model-libs/manifest';
import { DocumentModel, Manifest } from 'document-model/document';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModal } from 'src/components/modal';
import { useConnectConfig } from 'src/hooks/useConnectConfig';
import { useDefaultDocumentModelEditor } from 'src/hooks/useDefaultDocumentModelEditor';
import { useDocumentDrives } from 'src/hooks/useDocumentDrives';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useFeatureFlag } from 'src/hooks/useFeatureFlags';
import { useUiNodes } from 'src/hooks/useUiNodes';
import { addExternalPackage, removeExternalPackage } from 'src/services/hmr';
import { logger } from 'src/services/logger';
import { useFilteredDocumentModels } from 'src/store/document-model';
import { useExternalPackages } from 'src/store/external-packages';
import packageJson from '../../../../package.json';

const LOCAL_REACTOR_VALUE = 'local-reactor';
const LOCAL_REACTOR_LABEL = 'Local Reactor';

const documentModelEditorOptions = [
    { label: 'V1', value: 'document-model-editor' },
    { label: 'V2', value: 'document-model-editor-v2' },
] as const;

function manifestToDetails(manifest: Manifest, id: string) {
    const documentModels = manifest.documentModels.map(
        dm => `Document Model: ${dm.name}`,
    );
    const editors = manifest.editors.map(editor => `Editor: ${editor.name}`);
    return {
        id,
        ...manifest,
        publisher: manifest.publisher.name,
        publisherUrl: manifest.publisher.url,
        modules: documentModels.concat(editors),
    };
}

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
    const { clearStorage, deleteDrive } = useDocumentDriveServer();
    const { t } = useTranslation();
    const enabledDocuments = useFilteredDocumentModels();
    const { setConfig } = useFeatureFlag();
    const { showModal } = useModal();
    const [connectConfig] = useConnectConfig();
    const [documentModelEditor, setDocumentModelEditor] =
        useDefaultDocumentModelEditor();
    const [selectedDocuments, setSelectedDocuments] = useState(
        mapDocumentModelsToOptions(enabledDocuments ?? []), // TODO selected documents should update when new document models are loaded
    );

    const { driveNodes } = useUiNodes();

    const {
        content: { showDocumentModelSelectionSetting },
    } = connectConfig;

    const onSaveHandler = useCallback(() => {
        if (showDocumentModelSelectionSetting) {
            setConfig(conf => ({
                ...conf,
                editors: {
                    enabledEditors: selectedDocuments.map(doc => doc.value),
                },
            }));
        }

        onClose();
    }, [
        showDocumentModelSelectionSetting,
        onClose,
        setConfig,
        selectedDocuments,
    ]);

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

    // Package Manager
    const packages = useExternalPackages();
    const [drives] = useDocumentDrives();
    const [reactor, setReactor] = useState('');

    const options = useMemo(() => {
        return drives.reduce<
            { value: string; label: string; disabled: boolean }[]
        >((acc, drive) => {
            const trigger = drive.state.local.triggers.find(
                trigger => trigger.data?.url,
            );
            if (!trigger?.data?.url) {
                return acc;
            }

            const url = new URL(trigger.data.url);
            const isLocal =
                url.hostname === 'localhost' || url.hostname === '127.0.0.1';
            const label = drive.state.global.name;

            acc.push({
                value: isLocal ? LOCAL_REACTOR_VALUE : trigger.data.url,
                label: isLocal ? LOCAL_REACTOR_LABEL : label,
                disabled: !isLocal,
            });
            return acc;
        }, []);
    }, [drives]);

    useEffect(() => {
        setReactor(reactor => {
            const defaultOption = options.find(option => !option.disabled);
            if (reactor && options.find(option => option.value === reactor)) {
                return reactor;
            } else {
                return defaultOption?.value ?? '';
            }
        });
    }, [reactor, options]);

    // TODO packages should be filtered by reactor
    const packagesInfo = useMemo(() => {
        return [manifestToDetails(CommonManifest, 'common')].concat(
            ...packages.map(pkg => manifestToDetails(pkg.manifest, pkg.id)),
        );
    }, [packages]);

    const handleReactorChange = useCallback(
        (reactor?: string) => setReactor(reactor ?? ''),
        [],
    );
    const handleInstall = useCallback(
        (packageName: string) => {
            if (reactor !== LOCAL_REACTOR_VALUE) {
                throw new Error(
                    'Cannot install external package on a remote reactor',
                );
            }
            return addExternalPackage(packageName);
        },
        [reactor],
    );

    const handleUninstall = useCallback(
        (packageName: string) => {
            if (reactor !== LOCAL_REACTOR_VALUE) {
                throw new Error(
                    'Cannot delete external package on a remote reactor',
                );
            }
            return removeExternalPackage(packageName);
        },
        [reactor],
    );

    const tabs = [
        {
            id: 'package-manager',
            icon: <Icon name="PackageManager" size={12} />,
            label: 'Package Manager',
            content: PackageManager,
        },
        {
            id: 'default-editors',
            icon: <Icon name="Edit" size={12} />,
            label: 'Default Editors',
            content: DefaultEditor,
        },
        {
            id: 'danger-zone',
            icon: <Icon name="Danger" size={12} className="text-red-900" />,
            label: <span className="text-red-900">Danger Zone</span>,
            content: DangerZone,
        },
        {
            id: 'about',
            icon: <Icon name="QuestionSquare" size={12} />,
            label: 'About',
            content: About,
        },
    ];

    const handleDeleteDrive = useCallback(
        (drive: UiDriveNode) => deleteDrive(drive.driveId),
        [deleteDrive],
    );

    const handleOpenChange = useCallback(
        (status: boolean) => {
            if (!status) return onClose();
        },
        [onClose],
    );

    const handleSetDocumentEditor = useCallback((value: string) => {
        const option = documentModelEditorOptions.find(dm => dm.value == value);
        if (option) {
            setDocumentModelEditor(option);
        }
    }, []);

    return (
        <SettingsModalV2
            open={open}
            title={t('modals.connectSettings.title')}
            onOpenChange={handleOpenChange}
            tabs={tabs}
            reactorOptions={options}
            reactor={reactor}
            packages={packagesInfo}
            onReactorChange={handleReactorChange}
            onInstall={handleInstall}
            onUninstall={handleUninstall}
            packageJson={packageJson}
            documentModelEditor={documentModelEditor.value}
            setDocumentModelEditor={handleSetDocumentEditor}
            documentModelEditorOptions={
                documentModelEditorOptions as unknown as {
                    value: string;
                    label: string;
                }[]
            }
            drives={driveNodes}
            onDeleteDrive={handleDeleteDrive}
            onClearStorage={onClearStorage}
        />
    );
};
