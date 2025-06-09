import { type DocumentModelModule } from "document-model";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";

const documentModelModulesAtom = atom<DocumentModelModule[] | undefined>(
  undefined,
);
export function useDocumentModelModules() {
  return useAtomValue(documentModelModulesAtom);
}

export function useSetDocumentModelModules() {
  return useSetAtom(documentModelModulesAtom);
}

export function useGetDocumentModelModule() {
  const documentModelModules = useDocumentModelModules();
  return useCallback(
    (documentType: string) =>
      documentModelModules?.find(
        (module) => module.documentModel.id === documentType,
      ),
    [documentModelModules],
  );
}
