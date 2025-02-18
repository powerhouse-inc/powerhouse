import type { DocumentModelModule, EditorModule } from 'document-model';

export type DocumentModelsModule = {
    documentModels: DocumentModelModule<any, any>[];
    editors: EditorModule<any, any>[];
};
