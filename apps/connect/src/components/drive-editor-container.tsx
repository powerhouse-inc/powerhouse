import connectConfig from '#connect-config';
import {
    useDocumentDriveById,
    useDocumentDriveServer,
    useDocumentEditor,
    useEditorProps,
    useGetDocument,
    useSyncStatus,
} from '#hooks';
import {
    useAsyncReactor,
    useDriveEditor,
    useFileNodeDocument,
    useFilteredDocumentModels,
    useGetDocumentModelModule,
    useGetEditor,
} from '#store';
import { useDocumentDispatch } from '#utils';
import { GenericDriveExplorer } from '@powerhousedao/common';
import { type DriveEditorContext } from '@powerhousedao/reactor-browser';
import { makeDriveDocumentStateHook } from '@powerhousedao/reactor-browser/hooks/document-state';
import { type IDriveContext } from '@powerhousedao/reactor-browser/hooks/useDriveContext';
import { useUiNodesContext } from '@powerhousedao/reactor-browser/hooks/useUiNodesContext';
import {
    driveDocumentModelModule,
    type GetDocumentOptions,
} from 'document-drive';
import { type DocumentModelModule, type Operation } from 'document-model';
import { useCallback, useMemo } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { useGetDriveDocuments } from '../hooks/useGetDriveDocuments.js';
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

function useSelectedDocumentDrive() {
    const { selectedDriveNode } = useUiNodesContext();

    if (!selectedDriveNode) {
        throw new Error('No drive node selected');
    }

    const documentDrive = useDocumentDriveById(selectedDriveNode.id);

    if (!documentDrive.drive) {
        throw new Error(`Drive with id "${selectedDriveNode.id}" not found`);
    }

    return documentDrive.drive;
}

export function DriveEditorContainer() {
    const {
        selectedDriveNode,
        setSelectedNode,
        selectedNode,
        selectedParentNode,
    } = useUiNodesContext();
    const { addOperationToSelectedDrive } = useFileNodeDocument();
    const documentDrive = useSelectedDocumentDrive();
    const [document, _dispatch, error] = useDocumentDispatch(
        driveDocumentModelModule.reducer,
        documentDrive,
    );
    const reactor = useAsyncReactor();

    const handleAddOperationToSelectedDrive = useCallback(
        async (operation: Operation) => {
            await addOperationToSelectedDrive(operation);
        },
        [addOperationToSelectedDrive],
    );

    const editorProps = useEditorProps(
        document,
        selectedDriveNode,
        _dispatch,
        handleAddOperationToSelectedDrive,
    );

    const { showModal } = useModal();
    const showCreateDocumentModal = useCallback(
        (documentModel: DocumentModelModule) => {
            if (!selectedDriveNode) {
                throw new Error('No drive node selected');
            }

            showModal('createDocument', {
                documentModel,
                selectedParentNode,
                setSelectedNode,
            });
            return Promise.resolve({ name: 'New Document' }); // TODO fix this
        },
        [selectedDriveNode, selectedParentNode, setSelectedNode, showModal],
    );

    const { addFile, addDocument } = useDocumentDriveServer();
    const documentModels = useFilteredDocumentModels();
    const useDriveDocumentState = makeDriveDocumentStateHook(reactor);
    const getDocument = useGetDocument();
    const getDocumentModelModule = useGetDocumentModelModule();
    const getEditor = useGetEditor();

    const onGetDocumentRevision: DriveEditorContext['getDocumentRevision'] =
        useCallback(
            (documentId: string, options?: GetDocumentOptions) => {
                if (!selectedNode) {
                    console.error('No selected node');
                    return Promise.reject(new Error('No selected node'));
                }
                return getDocument(selectedNode.driveId, documentId, options);
            },
            [getDocument, selectedNode],
        );

    const driveContext: IDriveContext = useMemo(
        () => ({
            showSearchBar: false,
            isAllowedToCreateDocuments: editorProps.isAllowedToCreateDocuments,
            documentModels: documentModels ?? [],
            selectedDriveNode,
            selectedNode,
            selectNode: setSelectedNode,
            addFile,
            showCreateDocumentModal,
            useSyncStatus,
            useDocumentEditorProps: useDocumentEditor,
            useDriveDocumentStates: useGetDriveDocuments,
            useDriveDocumentState,
            addDocument,
        }),
        [
            reactor,
            editorProps.isAllowedToCreateDocuments,
            documentModels,
            selectedNode,
            setSelectedNode,
            addFile,
            addDocument,
            showCreateDocumentModal,
        ],
    );

    const driveEditor = useDriveEditor(document?.meta?.preferredEditor);

    if (!document) {
        return null;
    }

    const DriveEditorComponent =
        driveEditor?.Component ?? GenericDriveExplorer.Component;

    return (
        <ErrorBoundary
            fallbackRender={DriveEditorError}
            key={selectedDriveNode?.id}
        >
            <DriveEditorComponent
                key={selectedDriveNode?.id}
                {...editorProps}
                context={{
                    ...editorProps.context,
                    ...driveContext,
                    analyticsDatabaseName: connectConfig.analyticsDatabaseName,
                    getDocumentRevision: onGetDocumentRevision,
                    getDocumentModelModule,
                    getEditor,
                }}
                onSwitchboardLinkClick={undefined} // TODO
                document={document}
                error={error}
            />
        </ErrorBoundary>
    );
}
