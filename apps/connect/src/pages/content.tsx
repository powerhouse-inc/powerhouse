import { useUiNodes } from '#hooks';
import { FILE } from '@powerhousedao/design-system';
import { useEffect } from 'react';
import { DocumentEditorContainer } from '../components/document-editor-container.js';
import { DriveEditorContainer } from '../components/drive-editor-container.js';

export default function Content() {
    const uiNodes = useUiNodes();
    const { fileNodeDocument, selectedDriveNode, selectedNode, addFile } =
        uiNodes;

    useEffect(() => {
        return window.electronAPI?.handleFileOpen(async file => {
            if (!selectedDriveNode || selectedNode?.kind !== FILE) {
                return;
            }

            await addFile(
                file.content,
                selectedDriveNode.id,
                file.name,
                selectedNode.parentFolder,
            );
        });
    }, [selectedDriveNode, selectedNode, addFile]);

    return (
        <div className="flex h-full flex-col overflow-auto" id="content-view">
            {fileNodeDocument ? (
                <DocumentEditorContainer key={fileNodeDocument.documentId} />
            ) : selectedDriveNode ? (
                <DriveEditorContainer key={selectedDriveNode.id} />
            ) : null}
        </div>
    );
}
