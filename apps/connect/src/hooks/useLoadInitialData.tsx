import { ReloadConnectToast } from '#components';
import connectConfig from '#connect-config';
import { logger } from 'document-drive';
import { useEffect } from 'react';
import { toast } from '../services/toast.js';
import { isLatestVersion } from './utils.js';

export const useLoadInitialData = () => {
    async function checkLatestVersion() {
        const result = await isLatestVersion();
        if (result === null) return;
        // ignore dev/staging versions
        if (result.isLatest || result.currentVersion.includes('-')) {
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
};
