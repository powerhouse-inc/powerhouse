import connectConfig from '#connect-config';
import {
    useDocumentDriveServer,
    useDocumentEditor as useDocumentEditorProps,
    useEditorProps,
    useNodeActions,
    useShowDeleteNodeModal,
} from '#hooks';
import { useDocumentDispatch } from '#utils';
import { type IDriveContext } from '@powerhousedao/reactor-browser';
import {
    useDriveEditorModuleById,
    useSelectedDocument,
    useSelectedDrive,
} from '@powerhousedao/state';
import { driveDocumentModelModule } from 'document-drive';
import { type DocumentModelModule, type Operation } from 'document-model';
import { useCallback, useMemo } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { useModal } from './modal/index.js';

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
    const { addDriveOperations, getSyncStatusSync } = useDocumentDriveServer();
    const selectedDrive = useSelectedDrive();
    const selectedDocument = useSelectedDocument();
    const nodeActions = useNodeActions();
    const [, _dispatch, error] = useDocumentDispatch(
        driveDocumentModelModule.reducer,
        selectedDrive,
    );
    const onAddOperation = useCallback(
        async (operation: Operation) => {
            if (!selectedDrive?.header.id) {
                throw new Error('No drive selected');
            }
            await addDriveOperations(selectedDrive.header.id, [operation]);
        },
        [addDriveOperations, selectedDrive?.header.id],
    );

    const editorProps = useEditorProps(
        selectedDrive,
        _dispatch,
        onAddOperation,
    );

    const { isAllowedToCreateDocuments } = editorProps;

    const { showModal } = useModal();
    const showCreateDocumentModal = useCallback(
        (documentModel: DocumentModelModule) => {
            showModal('createDocument', {
                documentModel,
            });
        },
        [showModal],
    );
    const showDeleteNodeModal = useShowDeleteNodeModal();
    const { addFile, addDocument } = useDocumentDriveServer();
    const analyticsDatabaseName = connectConfig.analytics.databaseName;
    const showSearchBar = false;

    const driveContext: IDriveContext = useMemo(
        () => ({
            ...nodeActions,
            showSearchBar,
            isAllowedToCreateDocuments,
            analyticsDatabaseName,
            getSyncStatusSync,
            addFile,
            showCreateDocumentModal,
            showDeleteNodeModal,
            useDocumentEditorProps,
            addDocument,
        }),
        [
            nodeActions,
            isAllowedToCreateDocuments,
            addFile,
            addDocument,
            getSyncStatusSync,
            showDeleteNodeModal,
            showCreateDocumentModal,
        ],
    );

    const driveEditor = useDriveEditorModuleById(
        selectedDrive?.header.meta?.preferredEditor,
    );

    const DriveEditorComponent = driveEditor?.Component;

    if (selectedDocument || !selectedDrive || !DriveEditorComponent)
        return null;

    return (
        <ErrorBoundary
            fallbackRender={DriveEditorError}
            key={selectedDrive.header.id}
        >
            <DriveEditorComponent
                {...editorProps}
                context={{
                    ...editorProps.context,
                    ...driveContext,
                }}
                onSwitchboardLinkClick={undefined} // TODO
                document={selectedDrive}
                error={error}
            />
        </ErrorBoundary>
    );
}
