import connectConfig from '#connect-config';
import { getHMRModule, subscribeExternalPackages } from '#services';
import { type DriveEditorModule } from '@powerhousedao/reactor-browser';
import { type App, type DocumentModelLib } from 'document-model';
import { atom, useAtomValue } from 'jotai';
import { atomWithLazy } from 'jotai/utils';
import { useCallback, useMemo } from 'react';

export type ExternalPackage = DocumentModelLib & { id: string };
export type ExternalPackagesModule = { default?: ExternalPackage[] };

const externalPackagesUrl =
    connectConfig.routerBasename + 'external-packages.js';
const externalPackagesEnabled = import.meta.env.PROD;

async function loadExternalPackages() {
    try {
        if (!externalPackagesEnabled) return [];
        const module = (await import(
            /* @vite-ignore */ externalPackagesUrl
        )) as ExternalPackagesModule;
        return module.default ?? [];
    } catch (error) {
        console.error(error);
        return [];
    }
}

const hmrAvailableAtom = atom(async () => {
    const module = await getHMRModule();
    return typeof module !== 'undefined';
});
hmrAvailableAtom.debugLabel = 'hmrAvailableAtom';

export const useMutableExternalPackages = () => useAtomValue(hmrAvailableAtom);

// fetches the initial external packages only when needed
export const externalPackagesAtom = atomWithLazy(loadExternalPackages);
externalPackagesAtom.debugLabel = 'externalPackagesAtomInConnect';

// subscribes to changes to the external packages from HMR
let externalPackagesSubscription: Promise<() => void> | undefined;
externalPackagesAtom.onMount = setAtom => {
    if (externalPackagesSubscription) return;

    externalPackagesSubscription = subscribeExternalPackages(
        externalPackages => {
            setAtom(externalPackages);
        },
    );
};

export const useExternalPackages = () => useAtomValue(externalPackagesAtom);

export const CommonPackage: App = {
    id: 'powerhouse/common',
    name: 'Generic Drive Explorer',
    driveEditor: 'GenericDriveExplorer',
};

const appsAtom = atom<Promise<App[]>>(async get => {
    const externalPackages = await get(externalPackagesAtom);
    return [
        CommonPackage,
        ...externalPackages
            .map(pkg => pkg.manifest.apps)
            .filter(pkg => pkg !== undefined)
            .flat(),
    ];
});
appsAtom.debugLabel = 'appsAtomInConnect';

export const useApps = () => useAtomValue(appsAtom);

export const useAppEditor = (appId: string) => {
    const externalPackages = useExternalPackages();
    const apps = useApps();
    return useMemo(() => {
        const app = apps.find(app => app.id === appId);
        if (!app) return undefined;
        return app.driveEditor;
    }, [externalPackages, apps, appId]);
};

export const useGetAppNameForEditorId = () => {
    const apps = useApps();
    return useCallback(
        (editorId?: string) => {
            if (!editorId) return undefined;
            const app = apps.find(app => app.driveEditor === editorId);
            return app?.name;
        },
        [apps],
    );
};

export const useDriveEditor = (editorId?: string) => {
    const externalPackages = useExternalPackages();
    return useMemo(() => {
        if (!editorId) return undefined;
        const pkg = externalPackages.find(pkg =>
            pkg.manifest.apps?.find(app => app.driveEditor === editorId),
        );
        return pkg?.editors.find(
            editor => editor.config.id === editorId,
        ) as DriveEditorModule;
    }, [externalPackages, editorId]);
};
