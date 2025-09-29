import { useDocumentOfType } from "@powerhousedao/reactor-browser";
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

export function useAppModuleDocument(documentId: string) {
  return useDocumentOfType<AppModuleDocument, AppModuleAction>(
    documentId,
    "powerhouse/app",
  );
}

export function useDocumentEditorDocument(documentId: string) {
  return useDocumentOfType<DocumentEditorDocument, DocumentEditorAction>(
    documentId,
    "powerhouse/document-editor",
  );
}

export function useProcessorModuleDocument(documentId: string) {
  return useDocumentOfType<ProcessorModuleDocument, ProcessorModuleAction>(
    documentId,
    "powerhouse/processor",
  );
}

export function useSubgraphModuleDocument(documentId: string) {
  return useDocumentOfType<SubgraphModuleDocument, SubgraphModuleAction>(
    documentId,
    "powerhouse/subgraph",
  );
}

export function useVetraPackageDocument(documentId: string) {
  return useDocumentOfType<VetraPackageDocument, VetraPackageAction>(
    documentId,
    "powerhouse/package",
  );
}
