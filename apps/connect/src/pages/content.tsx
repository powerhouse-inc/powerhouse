import {
    useConnectConfig,
    useDocumentDriveServer,
    useShowAddDriveModal,
} from '#hooks';
import { useGetAppNameForEditorId } from '#store';
import {
    HomeScreen,
    HomeScreenAddDriveItem,
    HomeScreenItem,
    Icon,
} from '@powerhousedao/design-system';
import {
    getDriveSharingType,
    useSelectedDocument,
    useSelectedDrive,
    useSelectedFolder,
    useSetSelectedDrive,
    useUnwrappedDrives,
    useUnwrappedSelectedDocument,
    useUnwrappedSelectedDrive,
    useUnwrappedSelectedFolder,
} from '@powerhousedao/state';
import { type DocumentDriveDocument } from 'document-drive';
import { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DocumentEditorContainer } from '../components/document-editor-container.js';
import { DriveEditorContainer } from '../components/drive-editor-container.js';

function getDriveIcon(drive: DocumentDriveDocument) {
    if (drive.state.global.icon) {
        return (
            <img
                src={drive.state.global.icon}
                alt={drive.header.name}
                height={32}
                width={32}
            />
        );
    }
    if (getDriveSharingType(drive) === 'LOCAL') {
        return <Icon name="Hdd" size={32} />;
    } else {
        return <Icon name="Server" size={32} />;
    }
}

export default function Content() {
    const { addFile } = useDocumentDriveServer();
    const selectedDrive = useUnwrappedSelectedDrive();
    const selectedFolder = useUnwrappedSelectedFolder();
    const selectedDocument = useUnwrappedSelectedDocument();

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
    const drives = useUnwrappedDrives();
    const loadableSelectedDrive = useSelectedDrive();
    const loadableSelectedFolder = useSelectedFolder();
    const loadableSelectedDocument = useSelectedDocument();
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
                        title={drive.header.name}
                        description={appName || 'Drive Explorer App'}
                        icon={getDriveIcon(drive)}
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
