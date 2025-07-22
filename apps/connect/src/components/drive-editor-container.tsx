import connectConfig from '#connect-config';
import {
    useDocumentDriveServer,
    useDocumentEditor as useDocumentEditorProps,
    useEditorProps,
    useNodeActions,
    useShowDeleteNodeModal,
} from '#hooks';
import {
    useDriveEditor,
    useFilteredDocumentModels,
    useGetDocumentModelModule,
    useGetEditor,
} from '#store';
import { useDocumentDispatch } from '#utils';
import { GenericDriveExplorer } from '@powerhousedao/common';
import { type IDriveContext } from '@powerhousedao/reactor-browser';
import {
    useDocumentsForSelectedDrive,
    useParentFolder,
    useSetSelectedDrive,
    useSetSelectedNode,
    useUnwrappedReactor,
    useUnwrappedSelectedDocument,
    useUnwrappedSelectedDrive,
    useUnwrappedSelectedFolder,
} from '@powerhousedao/state';
import {
    type DocumentDriveAction,
    driveDocumentModelModule,
} from 'document-drive';
import { type DocumentModelModule, type Operation } from 'document-model';
import { useCallback, useMemo } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { useModal } from './modal/index.js';

function DriveEditorError({ error }: FallbackProps) {
    return (
        <div className="mx-auto flex max-w-[80%]  flex-1 flex-col items-center justify-center">
            <h1 className="mb-2 text-xl font-semibold">Error</h1>
            <i>{error instanceof Error ? error.message : error}</i>
            <pre>{JSON.stringify(error, null, 2)}</pre>
        </div>
    );
}

export function DriveEditorContainer() {
    const { addDriveOperations, getSyncStatusSync } = useDocumentDriveServer();
    const selectedDrive = useUnwrappedSelectedDrive();
    const selectedFolder = useUnwrappedSelectedFolder();
    const selectedDocument = useUnwrappedSelectedDocument();
    const documents = useDocumentsForSelectedDrive();
    const setSelectedNode = useSetSelectedNode();
    const setSelectedDrive = useSetSelectedDrive();
    const nodeActions = useNodeActions();
    const parentFolder = useParentFolder(selectedDocument?.header.id);
    const [, _dispatch, error] = useDocumentDispatch(
        driveDocumentModelModule.reducer,
        selectedDrive,
    );
    const reactor = useUnwrappedReactor();
    const onAddOperation = useCallback(
        async (operation: Operation) => {
            if (!selectedDrive?.header.id) {
                throw new Error('No drive selected');
            }
            await addDriveOperations(selectedDrive.header.id, [
                operation as Operation<DocumentDriveAction>,
            ]);
        },
        [addDriveOperations, selectedDrive?.header.id],
    );

    const editorProps = useEditorProps(
        selectedDrive,
        _dispatch,
        onAddOperation,
    );

    const { isAllowedToCreateDocuments } = editorProps;

    const { showModal } = useModal();
    const showCreateDocumentModal = useCallback(
        (documentModel: DocumentModelModule) => {
            if (!selectedDrive) {
                throw new Error('No drive node selected');
            }

            showModal('createDocument', {
                documentModel,
            });
            return Promise.resolve({ name: 'New Document' }); // TODO fix this
        },
        [selectedDrive, showModal],
    );
    const showDeleteNodeModal = useShowDeleteNodeModal();
    const { addFile, addDocument } = useDocumentDriveServer();
    const documentModels = useFilteredDocumentModels() ?? [];
    const getDocumentModelModule = useGetDocumentModelModule();
    const getEditor = useGetEditor();
    const analyticsDatabaseName = connectConfig.analytics.databaseName;
    const showSearchBar = false;

    const driveContext: IDriveContext = useMemo(
        () => ({
            ...nodeActions,
            reactor,
            showSearchBar,
            isAllowedToCreateDocuments,
            documents,
            documentModels,
            selectedDrive,
            selectedFolder,
            selectedDocument,
            parentFolder,
            analyticsDatabaseName,
            getSyncStatusSync,
            getDocumentModelModule,
            getEditor,
            setSelectedNode,
            setSelectedDrive,
            addFile,
            showCreateDocumentModal,
            showDeleteNodeModal,
            useDocumentEditorProps,
            addDocument,
        }),
        [
            nodeActions,
            reactor,
            isAllowedToCreateDocuments,
            documentModels,
            selectedDrive,
            selectedFolder,
            selectedDocument,
            parentFolder,
            addFile,
            addDocument,
            getSyncStatusSync,
            getDocumentModelModule,
            getEditor,
            setSelectedNode,
            setSelectedDrive,
            showDeleteNodeModal,
            showCreateDocumentModal,
        ],
    );

    const driveEditor = useDriveEditor(
        selectedDrive?.header.meta?.preferredEditor,
    );

    const DriveEditorComponent =
        driveEditor?.Component ?? GenericDriveExplorer.Component;

    if (selectedDocument || !selectedDrive) return null;

    return (
        <ErrorBoundary
            fallbackRender={DriveEditorError}
            key={selectedDrive.header.id}
        >
            <DriveEditorComponent
                key={selectedDrive.header.id}
                {...editorProps}
                context={{
                    ...editorProps.context,
                    ...driveContext,
                }}
                onSwitchboardLinkClick={undefined} // TODO
                document={selectedDrive}
                error={error}
            />
        </ErrorBoundary>
    );
}
