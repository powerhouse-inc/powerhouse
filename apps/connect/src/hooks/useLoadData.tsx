import { ReloadConnectToast } from '#components';
import connectConfig from '#connect-config';
import { type PackagesUpdate } from '#services';
import { createReactor, loadBaseEditorPackages, useHmr } from '#store';
import {
    loadBaseDocumentModelPackages,
    type PHPackage,
    useInitializeConfig,
    useInitializePHPackages,
    useInitializeProcessorManager,
    useInitializeReactor,
} from '@powerhousedao/common';
import { toast } from '@powerhousedao/design-system';
import { logger } from 'document-drive';
import { useEffect } from 'react';
import { useClientErrorHandler } from './useClientErrorHandler';
import { isLatestVersion } from './utils';

async function loadBasePhPackages() {
    const baseDocumentModelPackages = await loadBaseDocumentModelPackages();
    const baseEditorPackages = await loadBaseEditorPackages();
    return [...baseDocumentModelPackages, ...baseEditorPackages];
}

export function useLoadData() {
    useInitializeConfig(connectConfig);
    useInitializeReactor(createReactor);
    useInitializeProcessorManager();
    const clientErrorHandler = useClientErrorHandler();
    useInitializePHPackages(loadBasePhPackages);
    const hmr = useHmr();

    useEffect(() => {
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

        checkLatestVersion().catch(console.error);
    }, []);

    useEffect(() => {
        if (!hmr) return;
        const handler = (data: PackagesUpdate) => {
            const modules = import(
                /* @vite-ignore */ `${data.url}?t=${data.timestamp}`
            ) as Promise<{
                default: PHPackage[];
            }>;
            modules
                .then(m => m.default)
                .then(externalPackages => {
                    // setExternalPackages(externalPackages);
                })
                .catch(console.error);
        };
        hmr.on('studio:external-packages-updated', handler);
        return () => {
            hmr.off('studio:external-packages-updated', handler);
        };
    }, [hmr /* setExternalPackages */]);

    // useEffect(() => {
    //     if (loadableExternalPackages.state !== 'hasData') return;
    //     const externalPackages = loadableExternalPackages.data;
    //     const documentModelModules = externalPackages.flatMap(
    //         p => p.documentModels,
    //     );
    //     const editors = externalPackages.flatMap(p => p.editors);
    //     setDocumentModelModules(documentModelModules);
    //     setEditors(editors);
    // }, [loadableExternalPackages, setDocumentModelModules, setEditors]);
}
