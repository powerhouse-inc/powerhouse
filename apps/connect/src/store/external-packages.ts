import { getHMRModule, subscribeExternalPackages } from '#services/hmr';
import { App, DocumentModelLib } from 'document-model';
import { atom, useAtomValue } from 'jotai';
import { atomWithLazy } from 'jotai/utils';
import { useMemo } from 'react';

const LOAD_EXTERNAL_PACKAGES = import.meta.env.LOAD_EXTERNAL_PACKAGES;
const shouldLoadExternalPackages = LOAD_EXTERNAL_PACKAGES === 'true';

export type ExternalPackage = DocumentModelLib & { id: string };

function loadExternalPackages() {
    if (!shouldLoadExternalPackages) {
        return Promise.resolve([]);
    } else {
        return import('PH:EXTERNAL_PACKAGES').then(
            module => module.default as ExternalPackage[],
        );
    }
}

const hmrAvailableAtom = atom(async () => {
    const module = await getHMRModule();
    return typeof module !== 'undefined';
});

export const useMutableExternalPackages = () => useAtomValue(hmrAvailableAtom);

// fetches the initial external packages only when needed
export const externalPackagesAtom = atomWithLazy(loadExternalPackages);

// subscribes to changes to the external packages from HMR
let externalPackagesSubscripion: Promise<() => void> | undefined;
externalPackagesAtom.onMount = setAtom => {
    if (externalPackagesSubscripion) return;

    externalPackagesSubscripion = subscribeExternalPackages(
        externalPackages => {
            setAtom(externalPackages);
        },
    );
};

export const useExternalPackages = () => useAtomValue(externalPackagesAtom);

const CommonPackage: App = {
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
            .filter(Boolean)
            .flat(),
    ];
});

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

/*
const appsAtom = atom<Promise<App[]>>(async get => {
    const externalPackages = await get(externalPackagesAtom);
    return externalPackages
        .map(
            pkg =>
                pkg.manifest.apps?.map(app => ({
                    ...app,
                    driveEditor: pkg.editors.find(
                        editor => editor.config.id === app.driveEditor,
                    ) as Editor<
                        DocumentDriveDocument,
                        DocumentDriveAction,
                        DocumentDriveLocalState
                    >,
                })) ?? [],
        )
        .flat();
});
*/
