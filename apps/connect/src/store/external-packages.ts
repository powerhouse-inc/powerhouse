import connectConfig from '#connect-config';
import { getHMRModule } from '#services';
import { type PHPackage } from '@powerhousedao/common';
import { type EditorModule, type PHDocument } from 'document-model';
import { atom, useAtomValue } from 'jotai';

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
export function loadExternalPackages() {
    return import('../external-packages.js')
        .catch(e => console.error(e))
        .then(module => (module?.default ?? []) as PHPackage[]);
}

export async function loadBaseEditorPackages() {
    const documentModelEditor = await import(
        '@powerhousedao/builder-tools/document-model-editor'
    );
    await import('@powerhousedao/builder-tools/style.css');
    const module = documentModelEditor.documentModelEditorModule;
    const baseEditorPackage: PHPackage = {
        id: 'document-model-editor-v2',
        editors: [module as EditorModule<PHDocument>],
        documentModels: [],
        manifest: {
            name: 'Document Model Editor V2',
            description: 'Document Model Editor V2',
            category: 'editor',
            publisher: {
                name: 'Powerhouse DAO',
                url: 'https://powerhouse.inc',
            },
        },
        subgraphs: [],
        importScripts: [],
    };
    return [baseEditorPackage];
}

const hmrAtom = atom(async () => {
    const module = await getHMRModule();
    return module;
});
hmrAtom.debugLabel = 'hmrAtom';

export const useHmr = () => useAtomValue(hmrAtom);
