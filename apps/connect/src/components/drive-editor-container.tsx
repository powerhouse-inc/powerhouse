import { useDocumentDriveById } from '#hooks/useDocumentDriveById';
import { useDocumentDriveServer } from '#hooks/useDocumentDriveServer';
import { useDocumentEditor } from '#hooks/useDocumentEditor';
import { useEditorProps } from '#hooks/useEditorProps';
import { useGetDriveDocuments } from '#hooks/useGetDriveDocuments';
import { useSyncStatus } from '#hooks/useSyncStatus';
import { useUiNodes } from '#hooks/useUiNodes';
import { useFilteredDocumentModels } from '#store/document-model';
import { useDriveEditor } from '#store/external-packages';
import { useAsyncReactor } from '#store/reactor';
import { useDocumentDispatch } from '#utils/document-model';
import { GenericDriveExplorer } from '@powerhousedao/common';
import { makeDriveDocumentStateHook } from '@powerhousedao/reactor-browser/hooks/document-state';
import {
    DriveContextProvider,
    type IDriveContext,
} from '@powerhousedao/reactor-browser/hooks/useDriveContext';
import { useUiNodesContext } from '@powerhousedao/reactor-browser/hooks/useUiNodesContext';
import { driveDocumentModelModule } from 'document-drive';
import { DocumentModelModule, Operation } from 'document-model';
import { useCallback, useMemo } from 'react';
import { ErrorBoundary, FallbackProps } from 'react-error-boundary';
import { useModal } from './modal';

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

    const { addOperationToSelectedDrive } = useUiNodes();
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

    const { addFile } = useDocumentDriveServer();
    const documentModels = useFilteredDocumentModels();
    const useDriveDocumentState = makeDriveDocumentStateHook(reactor);

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
        }),
        [
            reactor,
            editorProps.isAllowedToCreateDocuments,
            documentModels,
            selectedNode,
            setSelectedNode,
            addFile,
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
        <DriveContextProvider value={driveContext} key={selectedDriveNode?.id}>
            <ErrorBoundary
                fallbackRender={DriveEditorError}
                key={selectedDriveNode?.id}
            >
                <DriveEditorComponent
                    key={selectedDriveNode?.id}
                    {...editorProps}
                    onSwitchboardLinkClick={undefined} // TODO
                    document={document}
                    error={error}
                />
            </ErrorBoundary>
        </DriveContextProvider>
    );
}
