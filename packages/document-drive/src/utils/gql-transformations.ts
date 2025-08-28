import type { DocumentDriveDocument, PHDocumentGQL } from "document-drive";
import type { Operation, PHDocument } from "document-model";

type ResponseForDrive = {
  id: string;
  slug: string;
  meta: Record<string, unknown> | undefined;
  name: string;
  icon: string | undefined;
};
export function responseForDrive(drive: DocumentDriveDocument) {
  const response: ResponseForDrive = {
    id: drive.header.id,
    slug: drive.header.slug,
    meta: drive.header.meta,
    name: drive.state.global.name,
    icon: drive.state.global.icon ?? undefined,
  };
  return response;
}

export function responseForDocument(
  document: PHDocument,
  typeName: string,
): PHDocumentGQL {
  return {
    ...document.header,
    ...document,
    id: document.header.id,
    createdAt: document.header.createdAtUtcIso,
    lastModified: document.header.lastModifiedAtUtcIso,
    documentType: document.header.documentType,
    name: document.header.name,
    revision: document.header.revision.global || 0,
    state: document.state.global,
    stateJSON: document.state.global,
    operations: document.operations.global.map((op: Operation) => ({
      ...op,
      inputText:
        typeof op.action.input === "string"
          ? op.action.input
          : JSON.stringify(op.action.input),
    })),
    initialState: document.initialState.global,
    __typename: typeName,
  };
}
