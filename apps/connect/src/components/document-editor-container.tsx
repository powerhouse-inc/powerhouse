import { useDocumentDriveServer } from '#hooks';
import { buildDocumentSubgraphUrl } from '@powerhousedao/reactor-browser/utils/switchboard';
import {
    useDocumentModelModuleByDocumentType,
    useDriveIsRemote,
    useDriveRemoteUrl,
    useParentFolderId,
    useSelectedDocument,
    useSelectedDrive,
    useSetSelectedNode,
} from '@powerhousedao/state';
import { type Operation, type PHDocument } from 'document-model';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useModal } from '../components/modal/index.js';
import { exportFile, openUrl } from '../utils/index.js';
import { validateDocument } from '../utils/validate-document.js';
import { DocumentEditor } from './editors.js';

export function DocumentEditorContainer() {
    const { t } = useTranslation();
    const { showModal } = useModal();
    const { addDocumentOperations } = useDocumentDriveServer();
    const unwrappedSelectedDrive = useSelectedDrive();
    const selectedDocument = useSelectedDocument();
    const parentFolderId = useParentFolderId(selectedDocument?.header.id);
    const documentType = selectedDocument?.header.documentType;
    const isRemoteDrive = useDriveIsRemote(unwrappedSelectedDrive?.header.id);
    const remoteUrl = useDriveRemoteUrl(unwrappedSelectedDrive?.header.id);
    const documentModelModule =
        useDocumentModelModuleByDocumentType(documentType);
    const setSelectedNode = useSetSelectedNode();

    const onAddOperation = useCallback(
        async (operation: Operation) => {
            if (!selectedDocument?.header.id) {
                return;
            }
            await addDocumentOperations(selectedDocument.header.id, [
                operation,
            ]);
        },
        [addDocumentOperations, selectedDocument],
    );

    const onClose = useCallback(() => {
        setSelectedNode(parentFolderId);
    }, [parentFolderId, setSelectedNode]);

    const exportDocument = useCallback(
        (document: PHDocument) => {
            const validationErrors = validateDocument(document);

            if (validationErrors.length) {
                showModal('confirmationModal', {
                    title: t('modals.exportDocumentWithErrors.title'),
                    body: (
                        <div>
                            <p>{t('modals.exportDocumentWithErrors.body')}</p>
                            <ul className="mt-4 flex list-disc flex-col items-start px-4 text-xs">
                                {validationErrors.map((error, index) => (
                                    <li key={index}>{error.message}</li>
                                ))}
                            </ul>
                        </div>
                    ),
                    cancelLabel: t('common.cancel'),
                    continueLabel: t('common.export'),
                    onCancel(closeModal) {
                        closeModal();
                    },
                    onContinue(closeModal) {
                        closeModal();
                        return exportFile(document, documentModelModule);
                    },
                });
            } else {
                return exportFile(document, documentModelModule);
            }
        },
        [documentModelModule, showModal, t],
    );

    const onExport = useCallback(() => {
        if (selectedDocument) {
            return exportDocument(selectedDocument);
        }
    }, [exportDocument, selectedDocument]);

    const onOpenSwitchboardLink = useMemo(() => {
        return isRemoteDrive
            ? async () => {
                  if (!selectedDocument?.header.id) {
                      console.error('No selected document');
                      return;
                  }

                  if (!remoteUrl) {
                      console.error('No remote drive url found');
                      return;
                  }

                  if (!documentModelModule) {
                      console.error('No document model found');
                      return;
                  }

                  const url = buildDocumentSubgraphUrl(
                      remoteUrl,
                      selectedDocument.header.id,
                      documentModelModule.documentModel,
                  );
                  try {
                      await openUrl(url);
                  } catch (e) {
                      console.error('Error opening switchboard link', e);
                  }
              }
            : undefined;
    }, [isRemoteDrive, remoteUrl, selectedDocument, documentModelModule]);

    if (!selectedDocument) return null;

    return (
        <div className="flex-1 rounded-2xl bg-gray-50 p-4">
            <DocumentEditor
                document={selectedDocument}
                onClose={onClose}
                onExport={onExport}
                onAddOperation={onAddOperation}
                onOpenSwitchboardLink={onOpenSwitchboardLink}
            />
        </div>
    );
}
