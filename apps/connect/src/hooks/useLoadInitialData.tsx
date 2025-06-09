import { ReloadConnectToast } from '#components';
import { useReadModeContext } from '#context';
import { useDocumentDriveServer } from '#hooks';
import { useAsyncReactor } from '#store';
import { useUpdateNodeMap } from '@powerhousedao/common';
import { logger, type DocumentDriveDocument } from 'document-drive';
import { useEffect } from 'react';
import { toast } from '../services/toast.js';
import { useClientErrorHandler } from './useClientErrorHandler.js';
import { useConnectConfig } from './useConnectConfig.js';
import { useDocumentDrives } from './useDocumentDrives.js';
import { isLatestVersion } from './utils.js';

export const useLoadInitialData = () => {
    const { documentDrives, onSyncStatus } = useDocumentDriveServer();
    const updateNodeMap = useUpdateNodeMap();
    const [, , serverSubscribeUpdates] = useDocumentDrives();
    const { readDrives } = useReadModeContext();
    const clientErrorHandler = useClientErrorHandler();
    const reactor = useAsyncReactor();
    const [connectConfig] = useConnectConfig();

    async function checkLatestVersion() {
        const result = await isLatestVersion();
        if (result === null) return;
        if (result.isLatest) {
            return true;
        }

        if (
            import.meta.env.MODE === 'development' ||
            connectConfig.studioMode ||
            !connectConfig.warnOutdatedApp
        ) {
            logger.warn(
                `Connect is outdated: \nCurrent: ${result.currentVersion}\nLatest: ${result.latestVersion}`,
            );
        } else {
            toast(<ReloadConnectToast />, {
                type: 'connect-warning',
                toastId: 'outdated-app',
                autoClose: false,
            });
        }
    }

    useEffect(() => {
        checkLatestVersion().catch(console.error);
    }, []);

    useEffect(() => {
        const unsubscribe = serverSubscribeUpdates(clientErrorHandler);
        return unsubscribe;
    }, [serverSubscribeUpdates, documentDrives, clientErrorHandler]);

    useEffect(() => {
        const drives: DocumentDriveDocument[] = [
            ...readDrives,
            ...documentDrives,
        ];
        updateNodeMap(drives);
    }, [documentDrives, readDrives, updateNodeMap]);

    useEffect(() => {
        if (!reactor) {
            return;
        }

        const unsub = onSyncStatus(() => updateNodeMap(documentDrives));
        return unsub;
    }, [reactor, documentDrives, onSyncStatus, updateNodeMap]);
};
