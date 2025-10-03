import {
  useDocumentOfType,
  useSelectedDocumentId,
  useSelectedDocumentOfType,
  useSelectedDrive,
} from "@powerhousedao/reactor-browser";
import { isFileNode } from "document-drive";
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

const VETRA_PACKAGE_DOCUMENT_TYPE = "powerhouse/package";
const DOCUMENT_EDITOR_DOCUMENT_TYPE = "powerhouse/document-editor";
const SUBGRAPH_MODULE_DOCUMENT_TYPE = "powerhouse/subgraph";
const PROCESSOR_MODULE_DOCUMENT_TYPE = "powerhouse/processor";

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
    DOCUMENT_EDITOR_DOCUMENT_TYPE,
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
    PROCESSOR_MODULE_DOCUMENT_TYPE,
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
    SUBGRAPH_MODULE_DOCUMENT_TYPE,
  );
}

export function useSelectedSubgraphModuleDocument() {
  const documentId = useSelectedDocumentId();
  return useSubgraphModuleDocument(documentId);
}

export function useVetraPackageDocument(documentId: string | undefined | null) {
  return useDocumentOfType<VetraPackageDocument, VetraPackageAction>(
    documentId,
    VETRA_PACKAGE_DOCUMENT_TYPE,
  );
}

export function useSelectedVetraPackageDocument() {
  return useSelectedDocumentOfType<VetraPackageDocument, VetraPackageAction>(
    VETRA_PACKAGE_DOCUMENT_TYPE,
  );
}

export function useSelectedDriveVetraPackage() {
  const [selectedDrive] = useSelectedDrive();
  const documentId = selectedDrive.state.global.nodes.find(
    (node) =>
      isFileNode(node) && node.documentType === VETRA_PACKAGE_DOCUMENT_TYPE,
  )?.id;

  return useVetraPackageDocument(documentId);
}
