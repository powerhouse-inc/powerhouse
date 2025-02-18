import { DocumentModelLib } from 'document-model';
import { atom, useAtomValue } from 'jotai';
import { atomWithLazy } from 'jotai/utils';
import { getHMRModule, subscribeExternalPackages } from 'src/services/hmr';

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
