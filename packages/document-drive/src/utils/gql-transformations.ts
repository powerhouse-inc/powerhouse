import { type DocumentDriveDocument } from "document-drive";
import { type Operation, type PHDocument } from "document-model";

export function responseForDrive(drive: DocumentDriveDocument) {
  return {
    id: drive.header.id,
    slug: drive.header.slug,
    meta: drive.header.meta,
    name: drive.state.global.name,
    icon: drive.state.global.icon ?? undefined,
  };
}

export function responseForDocument(
  document: PHDocument | undefined,
  typeName: string,
): any {
  if (!document) return undefined;
  return {
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
        typeof op.input === "string" ? op.input : JSON.stringify(op.input),
    })),
    initialState: document.initialState.state.global,
    __typename: typeName,
  };
}
