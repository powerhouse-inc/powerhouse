import { useDocumentDriveById } from '#hooks/useDocumentDriveById';
import { useDocumentDriveServer } from '#hooks/useDocumentDriveServer';
import { useEditorProps } from '#hooks/useEditorProps';
import { useUiNodes } from '#hooks/useUiNodes';
import { useDocumentModels } from '#store/document-model';
import { useDocumentDispatch } from '#utils/document-model';
import {
    DriveContextProvider,
    genericDriveExplorerEditorModule,
    type IDriveContext,
} from '@powerhousedao/common';
import { UiNode, useUiNodesContext } from '@powerhousedao/design-system';
import { driveDocumentModelModule, Node } from 'document-drive';
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
            <genericDriveExplorerEditorModule.Component
                {...editorProps}
                onSwitchboardLinkClick={undefined}
                document={document}
                error={error}
            />
        </DriveContextProvider>
    );
}
