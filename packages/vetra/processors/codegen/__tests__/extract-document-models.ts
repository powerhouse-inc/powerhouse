import type {
  DocumentModelDocument,
  DocumentModelGlobalState,
  DocumentModelPHState,
} from "@powerhousedao/shared/document-model";
import {
  getOrCreateDirectory,
  loadDocumentModelInDir,
} from "@powerhousedao/codegen/utils";
import { documentModelDocumentModelModule } from "document-model";
import { readdirSync } from "node:fs";
import type { Project } from "ts-morph";

const isDefined = <T>(v: T | undefined | null): v is T => v != null;

export function extractDocumentModelDocuments(
  project: Project,
): DocumentModelDocument[] {
  const { directory: documentModelsDir } = getOrCreateDirectory(
    project,
    "document-models",
  );
  return readdirSync(documentModelsDir.getPath(), { withFileTypes: true })
    .map(loadDocumentModelInDir)
    .filter(isDefined)
    .map(buildDocumentModelDocument);
}

function buildDocumentModelDocument(
  globalState: DocumentModelGlobalState,
): DocumentModelDocument {
  const state = documentModelDocumentModelModule.utils.createState({
    global: globalState,
  } as Partial<DocumentModelPHState>);
  const doc = documentModelDocumentModelModule.utils.createDocument(state);
  doc.header.name = globalState.name;
  return doc;
}
