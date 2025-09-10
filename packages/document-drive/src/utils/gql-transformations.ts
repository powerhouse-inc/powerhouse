import type { DocumentDriveDocument } from "document-drive";
import type {
  Operation,
  PHBaseState,
  PHDocument,
  PHDocumentHeader,
} from "document-model";

export function responseForDrive(drive: DocumentDriveDocument) {
  return {
    id: drive.header.id,
    slug: drive.header.slug,
    meta: drive.header.meta,
    name: drive.state.global.name,
    icon: drive.state.global.icon ?? undefined,
  };
}

export type PHDocumentGQL = Omit<PHDocumentHeader, "revision"> & {
  id: string;
  revision: number;
  // @deprecated
  createdAt: string;
  // @deprecated
  lastModified: string;
  __typename: string;
  state: unknown;
  initialState: unknown;
  stateJSON: unknown;
  operations: Operation[];
  nodeName?: string;
};

export function responseForDocument<TState extends PHBaseState = PHBaseState>(
  document: PHDocument<TState>,
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
