import { useDocumentDrives, useUiNodes } from '#hooks';
import { FILE } from '@powerhousedao/design-system';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DocumentEditorContainer } from '../components/document-editor-container.js';
import { DriveEditorContainer } from '../components/drive-editor-container.js';
import { toast } from '../services/toast.js';

export default function Content() {
    const navigate = useNavigate();
    const { driveId } = useParams();
    const [documentDrives, , , status] = useDocumentDrives();
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

    // if drives are loaded and route driveId is not found
    // then redirects to homepage
    useEffect(() => {
        if (
            (status === 'LOADED' || status === 'ERROR') &&
            !documentDrives.find(
                d =>
                    d.state.global.id === driveId ||
                    d.slug === driveId ||
                    d.state.global.name === driveId,
            )
        ) {
            toast(<p>Drive {driveId} not found</p>, { type: 'warning' });
            navigate('/');
        }
    }, [status, driveId, documentDrives]);

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
