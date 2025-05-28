import { type SharingType } from '@powerhousedao/design-system';
import { type SyncStatus } from 'document-drive';
import { useSyncExternalStore } from 'react';
import { useDocumentDriveServer } from './useDocumentDriveServer.js';

export function useSyncStatus(
    driveId: string,
    documentId?: string,
): SyncStatus | undefined {
    const { getSyncStatusSync, onSyncStatus, documentDrives } =
        useDocumentDriveServer();

    const syncStatus = useSyncExternalStore(
        onStoreChange => {
            const unsub = onSyncStatus(onStoreChange);
            return unsub;
        },
        () => {
            const drive = documentDrives.find(_drive => _drive.id === driveId);

            if (!drive) return;
            const isReadDrive = 'readContext' in drive;
            const _sharingType = !isReadDrive
                ? drive.state.local.sharingType?.toUpperCase()
                : 'PUBLIC';

            const sharingType =
                _sharingType === 'PRIVATE' ? 'LOCAL' : _sharingType;

            if (!documentId) {
                const status = getSyncStatusSync(
                    driveId,
                    sharingType as SharingType,
                );

                return status;
            }

            const document = drive.state.global.nodes.find(
                node => node.id === documentId,
            );

            if (!document) return;
            if (!('synchronizationUnits' in document)) return;

            const status = getSyncStatusSync(
                documentId,
                sharingType as SharingType,
            );

            return status;
        },
    );

    return syncStatus;
}
