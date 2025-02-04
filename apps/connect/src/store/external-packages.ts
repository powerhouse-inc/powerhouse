import { useAtomValue } from 'jotai';
import { atomWithLazy } from 'jotai/utils';
import { getHMRModule } from 'src/utils/hmr';
import { DocumentModelsModule } from 'src/utils/types';

const LOAD_EXTERNAL_PACKAGES = import.meta.env.LOAD_EXTERNAL_PACKAGES;
const shouldLoadExternalPackages = LOAD_EXTERNAL_PACKAGES === 'true';

function loadExternalPackages() {
    if (!shouldLoadExternalPackages) {
        return Promise.resolve([]);
    } else {
        return import('PH:EXTERNAL_PACKAGES').then(
            module => module.default as DocumentModelsModule[],
        );
    }
}

type PackagesUpdate = {
    url: string;
    timestamp: string;
};

async function subscribeExternalPackages(
    callback: (modules: Promise<DocumentModelsModule[]>) => void,
) {
    const hmr = await getHMRModule();
    const handler = (data: PackagesUpdate) => {
        const modules = import(
            /* @vite-ignore */ `${data.url}?t=${data.timestamp}`
        ) as Promise<{
            default: DocumentModelsModule[];
        }>;
        callback(modules.then(m => m.default));
    };
    hmr?.on('studio:external-packages-updated', handler);
    return () => {
        hmr?.off('studio:external-packages-updated', handler);
    };
}

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
