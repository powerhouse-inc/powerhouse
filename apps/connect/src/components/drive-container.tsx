import { DriveView } from '@powerhousedao/design-system';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { useUserPermissions } from 'src/hooks/useUserPermissions';
import { driveSections } from 'src/utils/drive-sections';

export default function DriveContainer() {
    const { isAllowedToCreateDocuments } = useUserPermissions();
    const {
        driveNodesBySharingType,
        allowedDropdownMenuOptions,
        disableHoverStyles,
        dragAndDropHandlers,
        nodeHandlers,
        showAddDriveModal,
        showDriveSettingsModal,
    } = useDrivesContainer();

    return (
        <>
            {driveSections.map(({ label, sharingType, disableAddDrives }) => (
                <DriveView
                    {...dragAndDropHandlers}
                    {...nodeHandlers}
                    displaySyncFolderIcons
                    driveNodes={driveNodesBySharingType[sharingType]}
                    label={label}
                    groupSharingType={sharingType}
                    key={sharingType}
                    allowedDropdownMenuOptions={allowedDropdownMenuOptions}
                    disableAddDrives={disableAddDrives}
                    disableHighlightStyles={disableHoverStyles}
                    isAllowedToCreateDocuments={isAllowedToCreateDocuments}
                    showAddDriveModal={showAddDriveModal}
                    showDriveSettingsModal={showDriveSettingsModal}
                />
            ))}
        </>
    );
}
