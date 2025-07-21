import { useDocumentDriveServer } from '#hooks';
import { useGetDocumentModelModule } from '#store';
import { buildDocumentSubgraphUrl } from '@powerhousedao/reactor-browser/utils/switchboard';
import {
    useDriveIsRemote,
    useDriveRemoteUrl,
    useParentFolderId,
    useSelectedDocument,
    useSetSelectedNode,
    useUnwrappedSelectedDrive,
} from '@powerhousedao/state';
import { type Operation, type PHDocument } from 'document-model';
import isDeepEqual from 'fast-deep-equal';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModal } from '../components/modal/index.js';
import { exportFile, openUrl } from '../utils/index.js';
import { validateDocument } from '../utils/validate-document.js';
import { DocumentEditor } from './editors.js';

export function DocumentEditorContainer() {
    const { t } = useTranslation();
    const { showModal } = useModal();
    const { addDocumentOperations } = useDocumentDriveServer();
    const unwrappedSelectedDrive = useUnwrappedSelectedDrive();
    const loadableSelectedDocument = useSelectedDocument();
    const [internalSelectedDocument, setInternalSelectedDocument] = useState<
        PHDocument | undefined
    >();
    const selectedDriveId = unwrappedSelectedDrive?.header.id;
    const selectedDocumentId = internalSelectedDocument?.header.id;
    const parentFolderId = useParentFolderId(selectedDocumentId);
    const documentType = internalSelectedDocument?.header.documentType;
    const isRemoteDrive = useDriveIsRemote(selectedDriveId);
    const remoteUrl = useDriveRemoteUrl(selectedDriveId);
    const getDocumentModelModule = useGetDocumentModelModule();
    const documentModelModule = documentType
        ? getDocumentModelModule(documentType)
        : undefined;
    const setSelectedNode = useSetSelectedNode();

    const onAddOperation = useCallback(
        async (operation: Operation) => {
            if (!selectedDriveId || !selectedDocumentId) {
                return;
            }
            await addDocumentOperations(selectedDriveId, selectedDocumentId, [
                operation,
            ]);
        },
        [addDocumentOperations, selectedDocumentId, selectedDriveId],
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
                        return exportFile(document, getDocumentModelModule);
                    },
                });
            } else {
                return exportFile(document, getDocumentModelModule);
            }
        },
        [getDocumentModelModule, showModal, t],
    );

    const onExport = useCallback(() => {
        if (internalSelectedDocument) {
            return exportDocument(internalSelectedDocument);
        }
    }, [exportDocument, internalSelectedDocument]);

    const onOpenSwitchboardLink = useMemo(() => {
        return isRemoteDrive
            ? async () => {
                  if (!selectedDocumentId) {
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
                      selectedDocumentId,
                      documentModelModule.documentModel,
                  );
                  try {
                      await openUrl(url);
                  } catch (e) {
                      console.error('Error opening switchboard link', e);
                  }
              }
            : undefined;
    }, [isRemoteDrive, remoteUrl, selectedDocumentId, documentModelModule]);

    useEffect(() => {
        if (
            loadableSelectedDocument.state === 'hasData' &&
            !isDeepEqual(
                loadableSelectedDocument.data,
                internalSelectedDocument,
            )
        ) {
            setInternalSelectedDocument(loadableSelectedDocument.data);
        }
    }, [loadableSelectedDocument]);

    if (!internalSelectedDocument) return null;

    return (
        <div className="flex-1 rounded-2xl bg-gray-50 p-4">
            <DocumentEditor
                document={internalSelectedDocument}
                onClose={onClose}
                onExport={onExport}
                onAddOperation={onAddOperation}
                onOpenSwitchboardLink={onOpenSwitchboardLink}
            />
        </div>
    );
}
