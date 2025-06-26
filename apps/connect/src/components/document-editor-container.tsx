import { useDocumentDriveServer, useOpenSwitchboardLink } from '#hooks';
import {
    useDriveIsRemote,
    useGetDocumentModelModule,
    useModal,
    useParentFolder,
    useSetSelectedNode,
    useUnwrappedNodes,
    useUnwrappedSelectedDocument,
    useUnwrappedSelectedDrive,
} from '@powerhousedao/common';
import { type GetDocumentOptions } from 'document-drive';
import {
    type EditorContext,
    type Operation,
    type PHDocument,
} from 'document-model';
import { useCallback, useMemo } from 'react';
import { useAddOperationToSelectedDocument } from '../store/documents.js';
import { exportFile, openUrl } from '../utils/index.js';
import { validateDocument } from '../utils/validate-document.js';
import { DocumentEditor } from './editors.js';

export function DocumentEditorContainer() {
    const { show: showExportWithErrorsModal } = useModal('exportWithErrors');
    const addOperationToSelectedDocument = useAddOperationToSelectedDocument();
    const { renameNode, openFile } = useDocumentDriveServer();
    const selectedDocument = useUnwrappedSelectedDocument();
    const nodes = useUnwrappedNodes();
    const parentFolder = useParentFolder(selectedDocument?.id);
    const setSelectedNode = useSetSelectedNode();
    const selectedDrive = useUnwrappedSelectedDrive();
    const isRemoteDrive = useDriveIsRemote(selectedDrive?.id ?? null);
    const openSwitchboardLink = useOpenSwitchboardLink(
        selectedDrive?.id ?? null,
        selectedDocument?.id ?? null,
    );
    const getDocumentModelModule = useGetDocumentModelModule();

    const handleAddOperationToSelectedDocument = useCallback(
        async (operation: Operation) => {
            await addOperationToSelectedDocument(operation);
        },
        [addOperationToSelectedDocument],
    );

    const onDocumentChangeHandler = useCallback(
        (documentId: string, document: PHDocument) => {
            if (
                selectedDocument?.id &&
                selectedDrive?.id &&
                document.name !== '' &&
                selectedDocument.name !== document.name
            ) {
                return renameNode(
                    selectedDrive.id,
                    selectedDocument.id,
                    document.name,
                );
            }
        },
        [renameNode, selectedDocument?.id, selectedDrive?.id],
    );

    const onClose = useCallback(() => {
        setSelectedNode(parentFolder);
    }, [parentFolder, setSelectedNode]);

    const exportDocument = useCallback(
        (document: PHDocument) => {
            const validationErrors = validateDocument(document);

            if (validationErrors.length) {
                showExportWithErrorsModal({
                    document,
                    validationErrors,
                });
            } else {
                return exportFile(document, getDocumentModelModule);
            }
        },
        [getDocumentModelModule, showExportWithErrorsModal],
    );

    const onGetDocumentRevision: EditorContext['getDocumentRevision'] =
        useCallback(
            (options?: GetDocumentOptions) => {
                if (!selectedDocument?.id) {
                    console.error('No selected node');
                    return Promise.reject(new Error('No selected node'));
                }
                if (!selectedDrive?.id) {
                    console.error('No selected drive');
                    return Promise.reject(new Error('No selected drive'));
                }
                return openFile(selectedDrive.id, selectedDocument.id, options);
            },
            [openFile, selectedDrive?.id, selectedDocument?.id],
        );

    const onExport = useCallback(() => {
        if (!selectedDocument) {
            return;
        }
        return exportDocument(selectedDocument);
    }, [exportDocument, selectedDocument]);

    const onOpenSwitchboardLink = useMemo(() => {
        return isRemoteDrive
            ? async () => {
                  if (!selectedDocument) {
                      console.error('No selected document');
                      return;
                  }

                  if (!remoteUrl) {
                      console.error('No remote drive url found');
                      return;
                  }

                  const documentModelModule = getDocumentModelModule(
                      selectedDocument.documentType,
                  );

                  if (!documentModelModule) {
                      console.error('No document model found');
                      return;
                  }

                  const url = buildDocumentSubgraphUrl(
                      remoteUrl,
                      selectedDocument.id,
                      documentModelModule.documentModel,
                  );
                  try {
                      await openUrl(url);
                  } catch (e) {
                      console.error('Error opening switchboard link', e);
                  }
              }
            : undefined;
    }, [isRemoteDrive, remoteUrl, selectedDocument, getDocumentModelModule]);

    if (!fileNodeDocument) return null;

    return (
        <div className="flex h-full flex-col overflow-auto" id="content-view">
            <div className="flex-1 rounded-2xl bg-gray-50 p-4">
                <DocumentEditor
                    onChange={onDocumentChangeHandler}
                    onClose={onClose}
                    onExport={onExport}
                    onGetDocumentRevision={onGetDocumentRevision}
                    onAddOperation={handleAddOperationToSelectedDocument}
                    onOpenSwitchboardLink={onOpenSwitchboardLink}
                />
            </div>
        </div>
    );
}
