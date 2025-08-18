import connectConfig from '#connect-config';
import { useShowAddDriveModal } from '#hooks';
import {
    HomeScreen,
    HomeScreenAddDriveItem,
    HomeScreenItem,
} from '@powerhousedao/design-system';
import {
    addFile,
    setSelectedDrive,
    useDrives,
    useSelectedDocument,
    useSelectedDrive,
    useSelectedFolder,
} from '@powerhousedao/reactor-browser';
import { useEffect } from 'react';
import { DocumentEditorContainer } from '../components/document-editor-container.js';
import { DriveEditorContainer } from '../components/drive-editor-container.js';
import { DriveIcon } from '../components/drive-icon.js';
export default function Content() {
    const selectedDrive = useSelectedDrive();
    const selectedFolder = useSelectedFolder();
    const selectedDocument = useSelectedDocument();

    // useEffect(() => {
    //     return window.electronAPI?.handleFileOpen(async file => {
    //         if (!selectedDrive?.header.id || !selectedDocument?.header.id) {
    //             return;
    //         }

    //         await addFile(
    //             file.content,
    //             selectedDrive.header.id,
    //             file.name,
    //             selectedFolder?.id,
    //         );
    //     });
    // }, [
    //     selectedDrive?.header.id,
    //     selectedFolder?.id,
    //     selectedDocument?.header.id,
    //     addFile,
    // ]);

    return (
        <ContentContainer>
            {selectedDocument && <DocumentEditorContainer />}
            {(!!selectedDrive || !!selectedFolder) && !selectedDocument && (
                <DriveEditorContainer />
            )}
            {!selectedDocument && !selectedDrive && <HomeScreenContainer />}
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
    const drives = useDrives();
    const showAddDriveModal = useShowAddDriveModal();
    const config = connectConfig;

    return (
        <HomeScreen>
            {drives?.map(drive => {
                return (
                    <HomeScreenItem
                        key={drive.header.id}
                        title={drive.state.global.name}
                        description={'Drive Explorer App'}
                        icon={<DriveIcon drive={drive} />}
                        onClick={() => setSelectedDrive(drive)}
                    />
                );
            })}
            {config.drives.addDriveEnabled && (
                <HomeScreenAddDriveItem onClick={showAddDriveModal} />
            )}
        </HomeScreen>
    );
}
