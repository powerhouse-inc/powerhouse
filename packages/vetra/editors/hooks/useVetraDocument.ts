import {
  useDocumentOfType,
  useSelectedDocumentId,
} from "@powerhousedao/reactor-browser";
import type {
  AppModuleAction,
  AppModuleDocument,
} from "../../document-models/app-module/index.js";
import {
  type DocumentEditorAction,
  type DocumentEditorDocument,
} from "../../document-models/document-editor/index.js";
import type {
  ProcessorModuleAction,
  ProcessorModuleDocument,
} from "../../document-models/processor-module/index.js";
import type {
  SubgraphModuleAction,
  SubgraphModuleDocument,
} from "../../document-models/subgraph-module/index.js";
import type {
  VetraPackageAction,
  VetraPackageDocument,
} from "../../document-models/vetra-package/index.js";

export function useAppModuleDocument(documentId: string | undefined | null) {
  return useDocumentOfType<AppModuleDocument, AppModuleAction>(
    documentId,
    "powerhouse/app",
  );
}

export function useSelectedAppModuleDocument() {
  const documentId = useSelectedDocumentId();
  return useAppModuleDocument(documentId);
}

export function useDocumentEditorDocument(
  documentId: string | undefined | null,
) {
  return useDocumentOfType<DocumentEditorDocument, DocumentEditorAction>(
    documentId,
    "powerhouse/document-editor",
  );
}

export function useSelectedDocumentEditorDocument() {
  const documentId = useSelectedDocumentId();
  return useDocumentEditorDocument(documentId);
}

export function useProcessorModuleDocument(
  documentId: string | undefined | null,
) {
  return useDocumentOfType<ProcessorModuleDocument, ProcessorModuleAction>(
    documentId,
    "powerhouse/processor",
  );
}

export function useSelectedProcessorModuleDocument() {
  const documentId = useSelectedDocumentId();
  return useProcessorModuleDocument(documentId);
}

export function useSubgraphModuleDocument(
  documentId: string | undefined | null,
) {
  return useDocumentOfType<SubgraphModuleDocument, SubgraphModuleAction>(
    documentId,
    "powerhouse/subgraph",
  );
}

export function useSelectedSubgraphModuleDocument() {
  const documentId = useSelectedDocumentId();
  return useSubgraphModuleDocument(documentId);
}

export function useVetraPackageDocument(documentId: string | undefined | null) {
  return useDocumentOfType<VetraPackageDocument, VetraPackageAction>(
    documentId,
    "powerhouse/package",
  );
}

export function useSelectedVetraPackageDocument() {
  const documentId = useSelectedDocumentId();
  return useVetraPackageDocument(documentId);
}
