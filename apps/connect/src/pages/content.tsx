import { useDocumentDrives, useDocumentDriveServer } from '#hooks';
import { useFileNodeDocument } from '#store';
import { FILE } from '@powerhousedao/design-system';
import {
    useSelectedDriveId,
    useSelectedNodeId,
    useSelectedNodeKind,
    useSelectedParentNodeId,
    useSetSelectedNodeId,
} from '@powerhousedao/reactor-browser';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DocumentEditorContainer } from '../components/document-editor-container.js';
import { DriveEditorContainer } from '../components/drive-editor-container.js';
import { toast } from '../services/toast.js';

export default function Content() {
    console.log('rendering content...');
    const navigate = useNavigate();
    const { driveId } = useParams();
    const [documentDrives, , , status] = useDocumentDrives();
    const selectedDriveId = useSelectedDriveId();
    const selectedNodeId = useSelectedNodeId();
    const selectedParentNodeId = useSelectedParentNodeId();
    const selectedNodeKind = useSelectedNodeKind();
    const setSelectedNodeId = useSetSelectedNodeId();
    const { addFile } = useDocumentDriveServer();
    const { fileNodeDocument } = useFileNodeDocument();
    const firstDriveId = documentDrives[0]?.id;

    useEffect(() => {
        if (!firstDriveId) return;
        if (selectedDriveId === null && firstDriveId) {
            setSelectedNodeId(firstDriveId);
        }
    }, [selectedDriveId, setSelectedNodeId, firstDriveId]);

    useEffect(() => {
        return window.electronAPI?.handleFileOpen(async file => {
            if (
                !selectedDriveId ||
                !selectedParentNodeId ||
                selectedNodeKind !== FILE
            ) {
                return;
            }

            await addFile(
                file.content,
                selectedDriveId,
                file.name,
                selectedParentNodeId,
            );
        });
    }, [selectedDriveId, selectedParentNodeId, addFile]);

    // if drives are loaded and route driveId is not found
    // then redirects to homepage
    useEffect(() => {
        if (
            (status === 'LOADED' || status === 'ERROR') &&
            !documentDrives.find(
                d =>
                    d.id === driveId ||
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
            ) : selectedDriveId ? (
                <DriveEditorContainer key={selectedDriveId} />
            ) : null}
        </div>
    );
}
