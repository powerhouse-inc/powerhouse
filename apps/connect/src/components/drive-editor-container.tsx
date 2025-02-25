import {
    DocumentDrive,
    DriveContextProvider,
    GenericDriveExplorer,
    IDriveContext,
    useDriveContext,
} from '@powerhousedao/common';
import { useUiNodesContext } from '@powerhousedao/design-system';
import { DocumentModel, Operation } from 'document-model/document';
import { useCallback, useEffect, useMemo } from 'react';
import { ErrorBoundary, FallbackProps } from 'react-error-boundary';
import { useDocumentDriveById } from 'src/hooks/useDocumentDriveById';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useEditorProps } from 'src/hooks/useEditorProps';
import { useUiNodes } from 'src/hooks/useUiNodes';
import { useDocumentModels } from 'src/store/document-model';
import { useDriveEditor } from 'src/store/external-packages';
import { useDocumentDispatch } from 'src/utils/document-model';
import { useModal } from './modal';

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

function DriveEditorError({ error }: FallbackProps) {
    return (
        <div className="mx-auto flex max-w-[80%]  flex-1 flex-col items-center justify-center">
            <h1 className="mb-2 text-xl font-semibold">Error</h1>
            <i>{error instanceof Error ? error.message : error}</i>
            <pre>{JSON.stringify(error, null, 2)}</pre>
        </div>
    );
}

function DriveContextDebug() {
    const context = useDriveContext();
    const uiNodesContext = useUiNodesContext();
    console.log('uiNodesContext', uiNodesContext);
    return (
        <div>
            <pre>Context: {!!context}</pre>
        </div>
    );
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
        DocumentDrive.reducer,
        documentDrive,
    );

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
        (documentModel: DocumentModel) => {
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
    const documentModels = useDocumentModels();
    const driveContext: IDriveContext = useMemo(
        () => ({
            showSearchBar: false,
            isAllowedToCreateDocuments: editorProps.isAllowedToCreateDocuments,
            documentModels: documentModels,
            selectedNode: selectedNode,
            selectNode: setSelectedNode,
            addFile,
            showCreateDocumentModal,
        }),
        [
            editorProps.isAllowedToCreateDocuments,
            documentModels,
            selectedNode,
            setSelectedNode,
            addFile,
            showCreateDocumentModal,
        ],
    );

    const driveEditor = useDriveEditor(document?.meta?.preferredEditor);
    useEffect(() => {
        console.log(
            `App Drive Editor for ${selectedDriveNode?.name}:`,
            driveEditor,
        );
    }, [driveEditor?.config.id, selectedDriveNode]);

    if (!document) {
        return null;
    }

    const DriveEditorComponent =
        driveEditor?.Component ?? GenericDriveExplorer.Component;

    return (
        <DriveContextProvider value={driveContext}>
            <ErrorBoundary fallbackRender={DriveEditorError}>
                <DriveEditorComponent
                    {...editorProps}
                    onSwitchboardLinkClick={undefined}
                    document={document}
                    error={error}
                />
            </ErrorBoundary>
        </DriveContextProvider>
    );
}
