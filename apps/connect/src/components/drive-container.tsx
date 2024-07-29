import { DriveView } from '@powerhousedao/design-system';
import { useUiNodes } from 'src/hooks/useUiNodes';
import { driveSections } from 'src/utils/drive-sections';

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
