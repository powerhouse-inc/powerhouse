import {
    useConnectConfig,
    useDocumentDriveServer,
    useShowAddDriveModal,
} from '#hooks';
import {
    HomeScreen,
    HomeScreenAddDriveItem,
    HomeScreenItem,
} from '@powerhousedao/design-system';
import {
    useDrives,
    useLoadableSelectedDocument,
    useLoadableSelectedDrive,
    useLoadableSelectedFolder,
    useSelectedDocument,
    useSelectedDrive,
    useSelectedFolder,
    useSetSelectedDrive,
} from '@powerhousedao/state';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DocumentEditorContainer } from '../components/document-editor-container.js';
import { DriveEditorContainer } from '../components/drive-editor-container.js';
import { DriveIcon } from '../components/drive-icon.js';
export default function Content() {
    const { addFile } = useDocumentDriveServer();
    const selectedDrive = useSelectedDrive();
    const selectedFolder = useSelectedFolder();
    const selectedDocument = useSelectedDocument();

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
    const [config] = useConnectConfig();

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
                return (
                    <HomeScreenItem
                        key={drive.header.id}
                        title={drive.state.global.name}
                        description={'Drive Explorer App'}
                        icon={<DriveIcon drive={drive} />}
                        onClick={() => setSelectedDrive(drive.header.id)}
                    />
                );
            })}
            {config.drives.addDriveEnabled && (
                <HomeScreenAddDriveItem onClick={showAddDriveModal} />
            )}
        </HomeScreen>
    );
}
