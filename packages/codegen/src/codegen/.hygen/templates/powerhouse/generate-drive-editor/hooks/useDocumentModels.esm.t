---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/hooks/useDocumentModels.ts"
unless_exists: true
---
import { useState, useEffect } from 'react';
import { documentModelsMap, documentEditorMap } from "../document-models.js";
import { type DocumentModelModule } from "document-model";

export function useDocumentModel(documentType: string): DocumentModelModule<any> {
  return documentModelsMap[documentType];
}

export function useDocumentEditorModule(documentType: string) {
  const [editorModule, setEditorModule] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const editorLoader = documentEditorMap[documentType];
    
    if (editorLoader && !editorModule) {
      setIsLoading(true);
      
      editorLoader()
        .then(module => {
          setEditorModule(module);
          setIsLoading(false);
        })
        .catch(err => {
          setError(err instanceof Error ? err : new Error('Failed to load editor module'));
          setIsLoading(false);
        });
    }
  }, [documentType, editorModule]);

  return {
    editorModule,
    isLoading,
    error
  };
} 