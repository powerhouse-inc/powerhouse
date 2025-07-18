import { useDocumentDrives, useDocumentDriveServer } from '#hooks';
import { useFileNodeDocument } from '#store';
/* import {
    useReactor,
    useDocuments,
    useDrives,
    useSelectedDocument,
    useSelectedDrive,
    useSelectedFolder,
} from '@powerhousedao/common'; */
import { FILE } from '@powerhousedao/design-system';
import { useUiNodesContext } from '@powerhousedao/reactor-browser';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DocumentEditorContainer } from '../components/document-editor-container.js';
import { DriveEditorContainer } from '../components/drive-editor-container.js';
import { toast } from '../services/toast.js';

export default function Content() {
    const navigate = useNavigate();
    const { driveId } = useParams();
    const [documentDrives, , , status] = useDocumentDrives();
    const { selectedDriveNode, selectedNode } = useUiNodesContext();
    const { addFile } = useDocumentDriveServer();
    const { fileNodeDocument } = useFileNodeDocument();
    /* const loadableReactor = useReactor();
    const loadableDrives = useDrives();
    const loadableDocuments = useDocuments();
    const loadableSelectedDrive = useSelectedDrive();
    const loadableSelectedFolder = useSelectedFolder();
    const loadableSelectedDocument = useSelectedDocument();

    console.log('in content', {
        loadableReactor,
        loadableDrives,
        loadableDocuments,
        loadableSelectedDrive,
        loadableSelectedFolder,
        loadableSelectedDocument,
    }); */

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
                    d.header.id === driveId ||
                    d.header.slug === driveId ||
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
