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

let externalPackages: DocumentModelsModule[] | undefined = undefined;

export async function getExternalPackages() {
    if (!externalPackages) {
        const result = await loadExternalPackages();
        externalPackages = result;
        return result;
    } else {
        return externalPackages;
    }
}
