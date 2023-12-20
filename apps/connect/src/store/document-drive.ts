import { decodeID, getRootPath } from '@powerhousedao/design-system';
import { Document, Operation } from 'document-model/document';
import { atom, useAtom } from 'jotai';
import { useEffect, useState } from 'react';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';

export const selectedPathAtom = atom<string | null>(null);
export const useSelectedPath = () => {
    const { documentDrives } = useDocumentDriveServer();
    const [selectedPath, setSelectedPath] = useAtom(selectedPathAtom);

    useEffect(() => {
        if (!selectedPath) {
            return;
        }
        const driveId = decodeID(getRootPath(selectedPath));
        const pathComponents = selectedPath.split('/');
        const nodeId =
            pathComponents.length > 1
                ? decodeID(pathComponents[pathComponents.length - 1])
                : undefined;

        const drive = documentDrives.find(
            drive => drive.state.global.id === driveId
        );
        const file = drive?.state.global.nodes.find(node => node.id === nodeId);
        // if drive was deleted then removes selected path
        if (!drive) {
            setSelectedPath(null);
        }
        // if file was deleted then selects parent folder
        else if (nodeId && !file) {
            setSelectedPath(pathComponents.slice(0, -1).join('/'));
        }
    }, [documentDrives, selectedPath]);

    return [selectedPath, setSelectedPath] as const;
};

export const useFileNodeDocument = (drive?: string, id?: string) => {
    const { openFile, addOperation: _addOperation } = useDocumentDriveServer();
    const [selectedDocument, setSelectedDocument] = useState<
        Document | undefined
    >();

    async function fetchDocument(drive: string, id: string) {
        try {
            const document = await openFile(drive, id);
            setSelectedDocument(document);
        } catch (error) {
            setSelectedDocument(undefined);
            console.error(error);
        }
    }

    useEffect(() => {
        if (drive && id) {
            fetchDocument(drive, id);
        } else {
            setSelectedDocument(undefined);
        }
    }, [drive, id]);

    async function addOperation(operation: Operation) {
        if (drive && id) {
            const document = await _addOperation(drive, id, operation);
            // TODO check new remote document vs local document
            setSelectedDocument(document);
        }
    }

    return [selectedDocument, setSelectedDocument, addOperation] as const;
};
