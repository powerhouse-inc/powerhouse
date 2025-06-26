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
