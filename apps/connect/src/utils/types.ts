import type { ExtendedEditor } from 'document-model-libs';
import type { DocumentModel } from 'document-model/document';

export type DocumentModelsModule = {
    documentModels: DocumentModel[];
    editors: ExtendedEditor[];
};
