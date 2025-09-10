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
  nodeName?: string,
): PHDocumentGQL {
  return {
    ...document.header,
    ...document,
    id: document.header.id,
    createdAt: document.header.createdAtUtcIso,
    lastModified: document.header.lastModifiedAtUtcIso,
    documentType: document.header.documentType,
    name: document.header.name,
    nodeName,
    revision: document.header.revision.global || 0,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    state: (document.state as any).global,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    stateJSON: (document.state as any).global,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    operations: (document.operations as any).global.map((op: Operation) => ({
      ...op,
      inputText:
        typeof op.action.input === "string"
          ? op.action.input
          : JSON.stringify(op.action.input),
    })),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    initialState: (document.initialState as any).global,
    __typename: typeName,
  };
}
