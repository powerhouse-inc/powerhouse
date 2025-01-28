import { DocumentDriveState } from 'document-model-libs/document-drive';
import { useDocumentDriveServer } from './useDocumentDriveServer';

type ExtendedDocumentDriveState = DocumentDriveState & { remoteUrl?: string };

export function useDocumentDriveById(driveId: string | undefined) {
    const { documentDrives } = useDocumentDriveServer();

    if (!driveId)
        return {
            drive: null,
            remoteUrl: null,
            isRemoteDrive: false,
        };

    const drive = documentDrives.find(
        drive => drive.state.global.id === driveId,
    );

    const pullResponder = drive?.state.local.triggers.find(
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        trigger => trigger.type === 'PullResponder',
    );

    const { remoteUrl } = (drive?.state.global ||
        {}) as ExtendedDocumentDriveState;

    const isRemoteDrive = !!remoteUrl || !!pullResponder;

    return {
        drive,
        remoteUrl: remoteUrl || pullResponder?.data?.url,
        isRemoteDrive,
    };
}
