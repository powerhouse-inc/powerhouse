import connectConfig from '#connect-config';
import {
    useDocumentDriveById,
    useDocumentDriveServer,
    useEditorProps,
    useGetDocument,
    useShowCreateDocumentModal,
} from '#hooks';
import {
    useAsyncReactor,
    useDriveEditor,
    useFileNodeDocument,
    useFilteredDocumentModels,
    useGetDocumentModelModule,
    useGetEditor,
} from '#store';
import { useDocumentDispatch } from '#utils';
import {
    GenericDriveExplorer,
    useSelectedDriveId,
    useSelectedNodeId,
} from '@powerhousedao/common';
import { makeDriveDocumentStateHook } from '@powerhousedao/reactor-browser/hooks/document-state';
import {
    driveDocumentModelModule,
    type GetDocumentOptions,
} from 'document-drive';
import { type Operation } from 'document-model';
import { useCallback } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';

function DriveEditorError({ error }: FallbackProps) {
    return (
        <div className="mx-auto flex max-w-[80%]  flex-1 flex-col items-center justify-center">
            <h1 className="mb-2 text-xl font-semibold">Error</h1>
            <i>{error instanceof Error ? error.message : error}</i>
            <pre>{JSON.stringify(error, null, 2)}</pre>
        </div>
    );
}

function useSelectedDocumentDrive() {
    const selectedDriveId = useSelectedDriveId();

    if (!selectedDriveId) {
        throw new Error('No drive node selected');
    }

    const documentDrive = useDocumentDriveById(selectedDriveId);

    if (!documentDrive.drive) {
        throw new Error(`Drive with id "${selectedDriveId}" not found`);
    }

    return documentDrive.drive;
}

export function DriveEditorContainer() {
    const { addOperationToSelectedDrive } = useFileNodeDocument();
    const documentDrive = useSelectedDocumentDrive();
    const selectedNodeId = useSelectedNodeId();
    const selectedDriveId = useSelectedDriveId();
    const [document, _dispatch, error] = useDocumentDispatch(
        driveDocumentModelModule.reducer,
        documentDrive,
    );
    const reactor = useAsyncReactor();

    const handleAddOperationToSelectedDrive = useCallback(
        async (operation: Operation) => {
            await addOperationToSelectedDrive(operation);
        },
        [addOperationToSelectedDrive],
    );

    const editorProps = useEditorProps(
        document,
        selectedNodeId,
        _dispatch,
        handleAddOperationToSelectedDrive,
    );

    const { addFile, addDocument } = useDocumentDriveServer();
    const documentModels = useFilteredDocumentModels();
    const useDriveDocumentState = makeDriveDocumentStateHook(reactor);
    const getDocument = useGetDocument();
    const getDocumentModelModule = useGetDocumentModelModule();
    const getEditor = useGetEditor();

    const onGetDocumentRevision = useCallback(
        (documentId: string, options?: GetDocumentOptions) => {
            if (!selectedNodeId) {
                console.error('No selected node');
                return Promise.reject(new Error('No selected node'));
            }
            if (!selectedDriveId) {
                console.error('No selected drive');
                return Promise.reject(new Error('No selected drive'));
            }
            return getDocument(selectedDriveId, documentId, options);
        },
        [getDocument, selectedDriveId],
    );

    const driveEditor = useDriveEditor(document?.meta?.preferredEditor);
    const showCreateDocumentModal = useShowCreateDocumentModal();

    if (!document) {
        return null;
    }

    const DriveEditorComponent =
        driveEditor?.Component ?? GenericDriveExplorer.Component;

    return (
        <ErrorBoundary fallbackRender={DriveEditorError} key={selectedDriveId}>
            <DriveEditorComponent
                key={selectedDriveId}
                {...editorProps}
                context={{
                    ...editorProps.context,
                    analyticsDatabaseName: connectConfig.analyticsDatabaseName,
                    getDocumentRevision: onGetDocumentRevision,
                    getDocumentModelModule,
                    getEditor,
                    showCreateDocumentModal,
                }}
                onSwitchboardLinkClick={undefined} // TODO
                document={document}
                error={error}
            />
        </ErrorBoundary>
    );
}
