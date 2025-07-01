import { type IAnalyticsStore } from '@powerhousedao/reactor-browser/analytics';
import { type ProcessorRecord } from 'document-drive/processors/types';
import { type DocumentModelLib } from 'document-model';
import { atom, useAtomValue } from 'jotai';
import { externalPackagesAtom } from './external-packages.js';

export type Processors = (module: {
    analyticsStore: IAnalyticsStore;
}) => (driveId: string) => ProcessorRecord[];

export type ExtendedDocumentModelLib = DocumentModelLib & {
    processors?: Processors;
};

function getProcessorsFromModules(modules: ExtendedDocumentModelLib[]) {
    return modules
        .map(module => module.processors)
        .reduce<Processors[]>((acc, val) => {
            if (val) {
                acc = [...acc, val];
            }
            return acc;
        }, []);
}

export const externalProcessorsAtom = atom(async get => {
    const externalPackages = await get(externalPackagesAtom);
    const externalProcessors = getProcessorsFromModules(
        externalPackages as unknown as ExtendedDocumentModelLib[],
    );

    return externalProcessors;
});

export const useExternalProcessors = () => {
    const externalProcessors = useAtomValue(externalProcessorsAtom);
    return externalProcessors;
};
