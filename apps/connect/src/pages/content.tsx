import {
    useConnectConfig,
    useDocumentDriveServer,
    useShowAddDriveModal,
} from '#hooks';
import { useApps, useGetAppNameForEditorId } from '#store';
import {
    HomeScreen,
    HomeScreenAddDriveItem,
    HomeScreenItem,
} from '@powerhousedao/design-system';
import {
    useDocumentModelModules,
    useDrives,
    useEditorModules,
    useLoadableSelectedDocument,
    useLoadableSelectedDrive,
    useLoadableSelectedFolder,
    usePHPackages,
    useSelectedDocument,
    useSelectedDrive,
    useSelectedFolder,
    useSetSelectedDrive,
} from '@powerhousedao/state';
import { type DocumentDriveDocument } from 'document-drive';
import { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DocumentEditorContainer } from '../components/document-editor-container.js';
import { DriveEditorContainer } from '../components/drive-editor-container.js';
import { DriveIcon } from '../components/drive-icon.js';
export default function Content() {
    const { addFile } = useDocumentDriveServer();
    const selectedDrive = useSelectedDrive();
    const selectedFolder = useSelectedFolder();
    const selectedDocument = useSelectedDocument();
    const editorModules = useEditorModules();
    const documentModelModules = useDocumentModelModules();
    const apps = useApps();
    const phPackages = usePHPackages();
    console.log('apps', apps);
    console.log('editorModules', editorModules);
    console.log('documentModelModules', documentModelModules);
    console.log('phPackages', phPackages);

    useEffect(() => {
        return window.electronAPI?.handleFileOpen(async file => {
            if (!selectedDrive?.header.id || !selectedDocument?.header.id) {
                return;
            }

            await addFile(
                file.content,
                selectedDrive.header.id,
                file.name,
                selectedFolder?.id,
            );
        });
    }, [
        selectedDrive?.header.id,
        selectedFolder?.id,
        selectedDocument?.header.id,
        addFile,
    ]);

    return (
        <ContentContainer>
            <DocumentEditorContainer />
            <DriveEditorContainer />
            <HomeScreenContainer />
        </ContentContainer>
    );
}

function ContentContainer({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-full flex-col overflow-auto" id="content-view">
            {children}
        </div>
    );
}

function HomeScreenContainer() {
    const { pathname } = useLocation();
    const drives = useDrives();
    const loadableSelectedDrive = useLoadableSelectedDrive();
    const loadableSelectedFolder = useLoadableSelectedFolder();
    const loadableSelectedDocument = useLoadableSelectedDocument();
    const showAddDriveModal = useShowAddDriveModal();
    const setSelectedDrive = useSetSelectedDrive();
    const getAppDescriptionForEditorId = useGetAppNameForEditorId();
    const [config] = useConnectConfig();
    const handleDriveClick = useCallback(
        (drive: DocumentDriveDocument) => {
            setSelectedDrive(drive.header.id);
        },
        [setSelectedDrive],
    );

    const onAddDriveClick = useCallback(() => {
        showAddDriveModal();
    }, [showAddDriveModal]);

    const isLoading =
        loadableSelectedDrive.state === 'loading' ||
        loadableSelectedFolder.state === 'loading' ||
        loadableSelectedDocument.state === 'loading';

    const isError =
        loadableSelectedDrive.state === 'hasError' ||
        loadableSelectedFolder.state === 'hasError' ||
        loadableSelectedDocument.state === 'hasError';

    const hasSelectedDriveOrFolderOrDocument =
        !isLoading &&
        !isError &&
        (!!loadableSelectedDrive.data ||
            !!loadableSelectedFolder.data ||
            !!loadableSelectedDocument.data);

    if (pathname !== '/') {
        return null;
    }

    if (hasSelectedDriveOrFolderOrDocument) {
        return null;
    }

    return (
        <HomeScreen>
            {drives?.map(drive => {
                const editorId = drive.header.meta?.preferredEditor;
                const appName = editorId
                    ? getAppDescriptionForEditorId(editorId)
                    : undefined;
                return (
                    <HomeScreenItem
                        key={drive.header.id}
                        title={drive.state.global.name}
                        description={appName || 'Drive Explorer App'}
                        icon={<DriveIcon drive={drive} />}
                        onClick={() => handleDriveClick(drive)}
                    />
                );
            })}
            {config.drives.addDriveEnabled && (
                <HomeScreenAddDriveItem onClick={onAddDriveClick} />
            )}
        </HomeScreen>
    );
}
