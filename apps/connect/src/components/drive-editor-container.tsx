import {
    DocumentDrive,
    DriveContextProvider,
    GenericDriveExplorer,
    IDriveContext,
} from '@powerhousedao/common';
import { useUiNodesContext } from '@powerhousedao/design-system';
import { DocumentModel, Operation } from 'document-model/document';
import { useCallback, useMemo } from 'react';
import { useDocumentDriveById } from 'src/hooks/useDocumentDriveById';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useEditorProps } from 'src/hooks/useEditorProps';
import { useUiNodes } from 'src/hooks/useUiNodes';
import { useDocumentModels } from 'src/store/document-model';
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

    if (!document) {
        return null;
    }

    console.log(document.meta);

    return (
        <DriveContextProvider value={driveContext}>
            <GenericDriveExplorer.Component
                {...editorProps}
                onSwitchboardLinkClick={undefined}
                document={document}
                error={error}
            />
        </DriveContextProvider>
    );
}
