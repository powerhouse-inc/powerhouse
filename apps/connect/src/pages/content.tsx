import { FILE } from '@powerhousedao/design-system';
import { useEffect } from 'react';
import { DocumentEditorContainer } from 'src/components/document-editor-container';
import { DriveView } from 'src/components/drive-view';
import { Footer } from 'src/components/footer';
import { useUiNodes } from 'src/hooks/useUiNodes';

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
        <div
            className="flex h-full flex-col overflow-auto bg-gray-100 p-6 pb-3"
            id="content-view"
        >
            {fileNodeDocument ? (
                <DocumentEditorContainer key={fileNodeDocument.documentId} />
            ) : (
                <DriveView />
            )}
            <div className="flex w-full flex-row justify-end pr-3 pt-3">
                <Footer />
            </div>
        </div>
    );
}
