import connectConfig from '#connect-config';
import {
    useDocumentDriveServer,
    useDocumentEditor as useDocumentEditorProps,
    useEditorProps,
    useNodeActions,
    useShowDeleteNodeModal,
} from '#hooks';
import { useDocumentDispatch } from '#utils';
import { GenericDriveExplorer } from '@powerhousedao/common';
import {
    type DriveEditorProps,
    type IDriveContext,
} from '@powerhousedao/reactor-browser';
import {
    setSelectedNode,
    useDefaultDriveEditorModule,
    useDocumentModelModules,
    useDriveEditorModuleById,
    useEditorModules,
    useSelectedDrive,
} from '@powerhousedao/state';
import { driveDocumentModelModule } from 'document-drive';
import {
    type DocumentModelModule,
    type EditorModule,
    type Operation,
    type PHDocument,
} from 'document-model';
import { useCallback, useMemo } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { useModal } from './modal/index.js';
// Dynamic import for vetra to avoid build issues when vetra is not available
let VetraDriveExplorer: any;

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
    const documentModelModules = useDocumentModelModules();
    const editorModules = useEditorModules();
    function getDocumentModelModule(documentType: string | undefined) {
        return documentModelModules?.find(
            module => module.documentModel.id === documentType,
        ) as DocumentModelModule<PHDocument> | undefined;
    }
    function getEditor(documentType: string | undefined) {
        return editorModules?.find(module =>
            module.documentTypes.includes(documentType ?? ''),
        ) as EditorModule | undefined;
    }

    const driveContext: IDriveContext = useMemo(
        () => ({
            ...nodeActions,
            getDocumentModelModule,
            getEditor,
            showSearchBar,
            isAllowedToCreateDocuments,
            analyticsDatabaseName,
            getSyncStatusSync,
            addFile,
            showCreateDocumentModal,
            showDeleteNodeModal,
            useDocumentEditorProps,
            addDocument,
            setSelectedNode,
        }),
        [
            nodeActions,
            isAllowedToCreateDocuments,
            getDocumentModelModule,
            getEditor,
            addFile,
            addDocument,
            getSyncStatusSync,
            showDeleteNodeModal,
            showCreateDocumentModal,
            setSelectedNode,
        ],
    );

    const driveEditor = useDriveEditorModuleById(
        selectedDrive?.header.meta?.preferredEditor,
    );
    const defaultDriveEditor = useDefaultDriveEditorModule();

    let DriveEditorComponent =
        driveEditor?.Component ??
        defaultDriveEditor?.Component ??
        GenericDriveExplorer.Component;

    // TODO: remove this after vetra command refactor
    if (selectedDrive?.header.meta?.preferredEditor === 'vetra-drive-app') {
        // Fallback to generic drive explorer if vetra is not available
        try {
            if (!VetraDriveExplorer) {
                // This will be resolved at runtime if vetra is available
                DriveEditorComponent = GenericDriveExplorer.Component;
            } else {
                DriveEditorComponent = (
                    VetraDriveExplorer as {
                        Component: React.FC<
                            DriveEditorProps<PHDocument> &
                                Record<string, unknown>
                        >;
                    }
                ).Component;
            }
        } catch {
            DriveEditorComponent = GenericDriveExplorer.Component;
        }
    }

    if (!selectedDrive) return null;

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
