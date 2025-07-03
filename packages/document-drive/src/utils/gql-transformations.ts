import { type DocumentDriveDocument } from "document-drive";
import {
  type Operation,
  type PHDocument,
  type PHDocumentHeader,
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
  __typename: string;
  state: unknown;
  initialState: unknown;
  stateJSON: unknown;
  operations: Operation[];
};

export function responseForDocument(
  document: PHDocument,
  typeName: string,
): PHDocumentGQL {
  return {
    ...document.header,
    revision: document.header.revision.global,
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
