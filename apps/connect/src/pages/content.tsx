import { DocumentEditorContainer } from '#components/document-editor-container';
import { DriveEditorContainer } from '#components/drive-editor-container';
import { useUiNodes } from '#hooks/useUiNodes';
import { FILE, Footer } from '@powerhousedao/design-system';
import { useEffect } from 'react';

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
            <div className="flex w-full flex-row justify-end pr-3 pt-3">
                <Footer />
            </div>
        </div>
    );
}
