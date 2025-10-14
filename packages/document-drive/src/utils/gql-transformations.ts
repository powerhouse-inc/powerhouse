import type { DocumentDriveDocument } from "document-drive";
import type { Operation, PHDocument, PHDocumentHeader } from "document-model";

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

export type PHDocumentGQL = Omit<PHDocumentHeader, "revision"> & {
  id: string;
  revision: number;
  /**
   * @deprecated Use createdAtUtcIso instead
   */
  createdAt: string;
  /**
   * @deprecated Use lastModifiedAtUtcIso instead
   */
  lastModified: string;
  __typename: string;
  state: unknown;
  initialState: unknown;
  stateJSON: unknown;
  operations: Operation[];
  nodeName?: string;
};

export function responseForDocument(
  document: PHDocument,
  typeName: string,
  nodeName?: string,
): PHDocumentGQL {
  let name = nodeName ?? document.header.name;

  // dynamically lookup if there is a global state
  if (Object.keys(document.state).includes("global")) {
    // dynamically pull the name field off of global state
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    name = (document.state as any).global.name;
  }

  return {
    ...document.header,
    ...document,
    id: document.header.id,
    createdAt: document.header.createdAtUtcIso,
    lastModified: document.header.lastModifiedAtUtcIso,
    documentType: document.header.documentType,
    name,
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
