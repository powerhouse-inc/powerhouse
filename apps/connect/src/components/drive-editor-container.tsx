import connectConfig from '#connect-config';
import { useDocumentDriveServer, useEditorProps } from '#hooks';
import { useDocumentDispatch } from '#utils';
import {
    GenericDriveExplorer,
    useDriveEditor,
    useGetDocumentModelModule,
    useGetEditor,
    useUnwrappedSelectedDocument,
    useUnwrappedSelectedDrive,
    useUnwrappedSelectedFolder,
} from '@powerhousedao/common';
import {
    type DocumentDriveDocument,
    driveDocumentModelModule,
    type GetDocumentOptions,
} from 'document-drive';
import { type Operation } from 'document-model';
import { useCallback } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { useAddOperationsToSelectedDrive } from '../store/documents';

function DriveEditorError({ error }: FallbackProps) {
    return (
        <div className="mx-auto flex max-w-[80%]  flex-1 flex-col items-center justify-center">
            <h1 className="mb-2 text-xl font-semibold">Error</h1>
            <i>{error instanceof Error ? error.message : error}</i>
            <pre>{JSON.stringify(error, null, 2)}</pre>
        </div>
    );
}

export function DriveEditorContainer() {
    const addOperationToSelectedDrive = useAddOperationsToSelectedDrive();
    const { addFile, openFile } = useDocumentDriveServer();
    const selectedDrive = useUnwrappedSelectedDrive();
    const selectedDocument = useUnwrappedSelectedDocument();
    const [, _dispatch, error] = useDocumentDispatch<DocumentDriveDocument>(
        driveDocumentModelModule.reducer,
        selectedDrive,
    );
    const handleAddOperationToSelectedDrive = useCallback(
        async (operation: Operation) => {
            await addOperationToSelectedDrive(operation);
        },
        [addOperationToSelectedDrive],
    );

    const editorProps = useEditorProps(
        _dispatch,
        handleAddOperationToSelectedDrive,
    );
    const getDocumentModelModule = useGetDocumentModelModule();
    const getEditor = useGetEditor();
    const getDocumentRevision = useCallback(
        (options?: GetDocumentOptions) => {
            if (!selectedDocument?.id) {
                console.error('No selected document');
                return Promise.reject(new Error('No selected document'));
            }
            if (!selectedDrive?.id) {
                console.error('No selected drive');
                return Promise.reject(new Error('No selected drive'));
            }
            return openFile(selectedDrive.id, selectedDocument.id, options);
        },
        [openFile, selectedDrive?.id, selectedDocument?.id],
    );

    const driveEditor = useDriveEditor(selectedDrive?.meta?.preferredEditor);

    const DriveEditorComponent = GenericDriveExplorer.Component;

    if (!selectedDrive) return null;

    return (
        <div className="flex h-full flex-col overflow-auto" id="content-view">
            <ErrorBoundary fallbackRender={DriveEditorError}>
                <DriveEditorComponent
                    {...editorProps}
                    context={{
                        ...editorProps.context,
                        analyticsDatabaseName:
                            connectConfig.analyticsDatabaseName,
                        getDocumentRevision,
                        getDocumentModelModule,
                    }}
                    document={selectedDrive}
                    error={error}
                    addFile={addFile}
                />
            </ErrorBoundary>
        </div>
    );
}
