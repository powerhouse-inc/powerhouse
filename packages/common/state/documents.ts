import { type PHDocument } from "document-model";
import { useAtomValue, useSetAtom } from "jotai";
import { type Loadable } from "jotai/vanilla/utils/loadable";
import {
  documentsAtom,
  loadableDocumentsAtom,
  loadableSelectedDocumentAtom,
  unwrappedDocumentsAtom,
  unwrappedSelectedDocumentAtom,
} from "./atoms.js";

export function useDocuments() {
  return useAtomValue(loadableDocumentsAtom);
}

export function useRefreshDocuments() {
  return useSetAtom(documentsAtom);
}

export function useUnwrappedDocuments() {
  return useAtomValue(unwrappedDocumentsAtom);
}

export function useSelectedDocument() {
  return useAtomValue(loadableSelectedDocumentAtom);
}

export function useUnwrappedSelectedDocument() {
  return useAtomValue(unwrappedSelectedDocumentAtom);
}

export function useDocumentById(
  id: string | null | undefined,
): Loadable<PHDocument | undefined> {
  const documents = useDocuments();
  if (!id) return { state: "hasData", data: undefined };
  if (documents.state !== "hasData") return documents;
  const document = documents.data.find((d) => d?.header.id === id);
  return { state: "hasData", data: document };
}

export function useUnwrappedDocumentById(
  id: string | null | undefined,
): PHDocument | undefined {
  const documents = useUnwrappedDocuments();
  if (!id) return undefined;
  return documents?.find((d) => d?.header.id === id);
}
