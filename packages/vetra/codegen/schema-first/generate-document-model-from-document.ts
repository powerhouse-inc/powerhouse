import { generateDocumentModel } from "@powerhousedao/codegen";
import type { DocumentModelDocument } from "@powerhousedao/shared/document-model";
import type { Project } from "ts-morph";

export async function generateDocumentModelFromDocument(
  doc: DocumentModelDocument,
  project: Project,
): Promise<void> {
  await generateDocumentModel(doc.state.global, project);
}
