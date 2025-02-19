import { useUiNodes } from '#hooks/useUiNodes';
import { driveSections } from '#utils/drive-sections';
import { DriveView } from '@powerhousedao/design-system';

export default function DriveContainer() {
    const uiNodes = useUiNodes();
    const { driveNodesBySharingType } = uiNodes;

    return (
        <>
            {driveSections.map(({ label, sharingType, disableAddDrives }) => (
                <DriveView
                    {...uiNodes}
                    driveNodes={driveNodesBySharingType[sharingType]}
                    label={label}
                    groupSharingType={sharingType}
                    key={sharingType}
                    disableAddDrives={disableAddDrives}
                />
            ))}
        </>
    );
}
