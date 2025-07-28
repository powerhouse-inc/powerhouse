import { type ExternalPackage } from '#store';
import { useUpdatePHPackages } from '@powerhousedao/state';
import { type PHPackage } from '@powerhousedao/state/internal/types';
import { logger } from 'document-drive';
import { useCallback, useEffect, useRef } from 'react';
import type { ViteHotContext } from 'vite/types/hot.js';

export type PackagesUpdate = {
    url: string;
    timestamp: string;
};

export async function getHMRModule(): Promise<ViteHotContext | undefined> {
    // if running connect in dev mode then use its hmr
    if (import.meta.hot) {
        return import.meta.hot as ViteHotContext;
    }

    try {
        const module = await import('../hmr.js');
        const hmr = module.hmr;
        return hmr;
    } catch (e) {
        return undefined;
    }
}

export async function addExternalPackage(name: string) {
    const hmr = await getHMRModule();
    if (!hmr) {
        throw new Error('HMR not available.');
    }

    return new Promise<void>(resolve => {
        function handle(addedPackage: { name: string }) {
            if (name === addedPackage.name) {
                resolve();
                hmr?.off('studio:external-package-added', handle);
            }
        }
        hmr.on('studio:external-package-added', handle);
        hmr.send('studio:add-external-package', { name });
    });
}

export async function removeExternalPackage(name: string) {
    const hmr = await getHMRModule();
    if (!hmr) {
        throw new Error('HMR not available.');
    }

    return new Promise<void>(resolve => {
        function handle(removedPackage: { name: string }) {
            if (name === removedPackage.name) {
                resolve();
                hmr?.off('studio:external-package-removed', handle);
            }
        }
        hmr.on('studio:external-package-removed', handle);
        hmr.send('studio:remove-external-package', { name });
    });
}
export async function handlePackageEvents(
    handler: (data: { name: string }) => void,
) {
    const hmr = await getHMRModule();
    if (!hmr) {
        return;
    }
    hmr.on('studio:external-package-added', handler);

    return hmr.off('studio:external-package-added', handler);
}

export async function subscribeExternalPackages(
    callback: (modules: Promise<ExternalPackage[]>) => void,
) {
    const hmr = await getHMRModule();
    const handler = (data: PackagesUpdate) => {
        const modules = import(
            /* @vite-ignore */ `${data.url}?t=${data.timestamp}`
        ) as Promise<{
            default: ExternalPackage[];
        }>;
        callback(modules.then(m => m.default));
    };
    hmr?.on('studio:external-packages-updated', handler);
    return () => {
        hmr?.off('studio:external-packages-updated', handler);
    };
}

export function useSubscribeToPHPackages() {
    const updatePHPackages = useUpdatePHPackages();
    const hasSubscribed = useRef(false);
    const hmrRef = useRef<ViteHotContext>();

    const handler = useCallback(async (data: PackagesUpdate) => {
        const modulesImport = import(
            /* @vite-ignore */ `${data.url}?t=${data.timestamp}`
        ) as Promise<{
            default: PHPackage[];
        }>;
        const modules = await modulesImport;
        const defaultModules = modules.default;
        updatePHPackages(defaultModules);
    }, []);

    useEffect(() => {
        if (hasSubscribed.current) {
            return;
        }
        async function subscribe() {
            const hmr = await getHMRModule();
            hmrRef.current = hmr;
            hmr?.on('studio:external-packages-updated', handler);
        }
        subscribe().catch(logger.error);

        return () => {
            hmrRef.current?.off('studio:external-packages-updated', handler);
        };
    }, [handler]);
}
