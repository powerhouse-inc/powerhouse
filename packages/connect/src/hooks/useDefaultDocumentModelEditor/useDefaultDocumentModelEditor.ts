import { useAtom } from 'jotai';
import { defaultDocumentModelEditorAtom } from './atom';

export const useDefaultDocumentModelEditor = () => {
    return useAtom(defaultDocumentModelEditorAtom);
};
