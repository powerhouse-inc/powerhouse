import { useDocumentDriveById } from '#hooks/useDocumentDriveById';
import { useDocumentDriveServer } from '#hooks/useDocumentDriveServer';
import { useEditorProps } from '#hooks/useEditorProps';
import { useUiNodes } from '#hooks/useUiNodes';
import { useFilteredDocumentModels } from '#store/document-model';
import { useDocumentDispatch } from '#utils/document-model';
import { GenericDriveExplorer } from '@powerhousedao/common';
import { useUiNodesContext } from '@powerhousedao/design-system';
import {
    DriveContextProvider,
    type IDriveContext,
} from '@powerhousedao/reactor-browser/hooks/useDriveContext';
import { driveDocumentModelModule } from 'document-drive';
import { DocumentModelModule, Operation } from 'document-model';
import { useCallback, useMemo } from 'react';
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
        driveDocumentModelModule.reducer,
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
    const driveContext: IDriveContext = useMemo(
        () => ({
            showSearchBar: false,
            isAllowedToCreateDocuments: editorProps.isAllowedToCreateDocuments,
            documentModels: documentModels ?? [],
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
