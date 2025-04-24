---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/document-models.ts"
unless_exists: true
---
import { documentModelDocumentModelModule, type DocumentModelModule } from "document-model";
// Replace with your document model (you can support multiple document models)
// import { ToDo } from "../../document-models/index.js";

export const createLazyModuleLoader = <T,>(loader: () => Promise<T>) => {
  let modulePromise: Promise<T> | null = null;
  let loadedModule: T | null = null;
  
  return () => {
    if (loadedModule) return Promise.resolve(loadedModule);
    if (!modulePromise) {
      modulePromise = loader().then(module => {
        loadedModule = module;
        return module;
      });
    }
    return modulePromise;
  };
};

export const documentModelsMap: Record<string, DocumentModelModule<any>> = {
  // Replace with your document model (you can support multiple document models)
  // [ToDo.documentModel.id]: ToDo,
  [documentModelDocumentModelModule.documentModel.id]:
    documentModelDocumentModelModule,
};

export const documentEditorMap = {
  // Replace with your document model editor (you can support multiple document models editors)
  // [ToDo.documentModel.id]: createLazyModuleLoader(() =>
  //   import("../to-do-list/index.js").then(m => m.default)
  // ),
  [documentModelDocumentModelModule.documentModel.id]: createLazyModuleLoader(() =>
    import("@powerhousedao/builder-tools/style.css").then(() =>
      import("@powerhousedao/builder-tools/document-model-editor").then(
        m => m.documentModelEditorModule
      )
    )
  ),
} as const; 