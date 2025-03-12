import { useAtom } from 'jotai';
import { defaultDocumentModelEditorAtom } from './atom.js';

export const useDefaultDocumentModelEditor = () => {
    return useAtom(defaultDocumentModelEditorAtom);
};
