import {
    getDriveSharingType,
    useConfig,
    useDocuments,
    useDrives,
    useModal,
    useReactor,
    useSelectedDocument,
    useSelectedDrive,
    useSelectedFolder,
    useSetSelectedDrive,
    useUnwrappedDrives,
} from '@powerhousedao/common';
import {
    HomeScreen,
    HomeScreenAddDriveItem,
    HomeScreenItem,
    Icon,
} from '@powerhousedao/design-system';
import { type DocumentDriveDocument } from 'document-drive';
import { DocumentEditorContainer } from '../components/document-editor-container.js';
import { DriveEditorContainer } from '../components/drive-editor-container.js';

function getDriveIcon(drive: DocumentDriveDocument) {
    const iconSrc = drive.state.global.icon;
    const sharingType = getDriveSharingType(drive);
    if (iconSrc) {
        return <img src={iconSrc} alt={drive.name} height={32} width={32} />;
    }
    if (sharingType === 'LOCAL') {
        return <Icon name="Hdd" size={32} />;
    } else {
        return <Icon name="Server" size={32} />;
    }
}
export default function Content() {
    console.log('rendering content...');
    const drives = useUnwrappedDrives();
    const setSelectedDrive = useSetSelectedDrive();
    const { show: showAddDriveModal } = useModal('addDrive');
    const config = useConfig();
    const loadableReactor = useReactor();
    const loadableDocuments = useDocuments();
    const loadableDrives = useDrives();
    const loadableSelectedDrive = useSelectedDrive();
    const loadableSelectedFolder = useSelectedFolder();
    const loadableSelectedDocument = useSelectedDocument();
    console.log('loadableReactor', loadableReactor);
    console.log('loadableDocuments', loadableDocuments);
    console.log('loadableDrives', loadableDrives);
    console.log('loadableSelectedDrive', loadableSelectedDrive);
    console.log('loadableSelectedFolder', loadableSelectedFolder);
    console.log('loadableSelectedDocument', loadableSelectedDocument);

    if (
        loadableSelectedDocument.state === 'hasData' &&
        loadableSelectedDocument.data
    ) {
        return <DocumentEditorContainer />;
    }

    if (
        loadableSelectedFolder.state === 'hasData' &&
        loadableSelectedFolder.data
    ) {
        return <DriveEditorContainer />;
    }

    if (
        loadableSelectedDrive.state === 'hasData' &&
        loadableSelectedDrive.data
    ) {
        return <DriveEditorContainer />;
    }

    if (
        loadableSelectedDrive.state === 'hasData' &&
        !loadableSelectedDrive.data
    ) {
        return (
            <HomeScreen>
                {drives?.map(drive => {
                    return (
                        <HomeScreenItem
                            key={drive.id}
                            title={drive.name}
                            description={'Drive Explorer App'}
                            icon={getDriveIcon(drive)}
                            onClick={() => {
                                setSelectedDrive(drive.id);
                            }}
                        />
                    );
                })}
                {config.drives.addDriveEnabled && (
                    <HomeScreenAddDriveItem
                        onClick={() => showAddDriveModal()}
                    />
                )}
            </HomeScreen>
        );
    }

    return null;
}
