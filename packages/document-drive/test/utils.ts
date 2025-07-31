import { driveDocumentModelModule } from "#drive-document-model/module";
import { type BaseDocumentDriveServer } from "#server/base-server";
import { type IDocumentDriveServer } from "#server/types";
import {
  type Action,
  type ActionFromDocument,
  documentModelDocumentModelModule,
  type DocumentModelModule,
  type Operation,
  type PHDocument,
  type PHReducer,
} from "document-model";
import { type ExpectStatic } from "vitest";

export const baseDocumentModels = [
  driveDocumentModelModule,
  documentModelDocumentModelModule,
] as DocumentModelModule[];

export function expectUUID(expect: ExpectStatic): unknown {
  return expect.stringMatching(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
}

export function expectUTCTimestamp(expect: ExpectStatic): unknown {
  return expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/i);
}

export function buildOperation<TDocument extends PHDocument>(
  reducer: PHReducer<TDocument>,
  document: TDocument,
  action: Action,
  index?: number,
): Operation {
  const newDocument = reducer(document, action);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const operation = newDocument.operations[action.scope]
    .slice()
    .pop()! as Operation;

  return { ...operation, index: index ?? operation.index } as Operation;
}

export function buildOperations<TDocument extends PHDocument>(
  reducer: PHReducer<TDocument>,
  document: TDocument,
  actions: Array<Action>,
): Operation[] {
  const operations: Operation[] = [];
  for (const action of actions) {
    document = reducer(document, action);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const operation = document.operations[action.scope]
      .slice()
      .pop()! as Operation;
    operations.push(operation);
  }
  return operations;
}

export function buildOperationAndDocument<TDocument extends PHDocument>(
  reducer: PHReducer<TDocument>,
  document: TDocument,
  action: ActionFromDocument<TDocument>,
  index?: number,
): {
  document: TDocument;
  operation: Operation;
} {
  const newDocument = reducer(document, action);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const operation = newDocument.operations[action.scope].slice().pop()!;

  return {
    document: newDocument,
    operation: {
      ...operation,
      index: index ?? operation.index,
    } as Operation,
  };
}

export class BasicClient<TDocument extends PHDocument = PHDocument> {
  private unsyncedOperations: Operation[] = [];

  constructor(
    private server: BaseDocumentDriveServer,
    private driveId: string,
    private documentId: string,
    private document: TDocument,
    private reducer: PHReducer<TDocument>,
  ) {}

  getDocument(): TDocument {
    return this.document;
  }

  clearUnsyncedOperations() {
    this.unsyncedOperations = [];
  }

  async pushOperationsToServer() {
    const result = await this.server.addOperations(
      this.documentId,
      this.unsyncedOperations,
    );

    if (result.status === "SUCCESS") {
      this.unsyncedOperations = [];
    }

    return result;
  }

  async syncDocument() {
    this.clearUnsyncedOperations();

    const remoteDocument = await this.server.getDocument(this.documentId);

    const remoteDocumentOperations = Object.values(
      remoteDocument.operations,
    ).flat() as Operation[];

    const result = await this.server._processOperations(
      this.documentId,
      this.document,
      remoteDocumentOperations,
    );

    this.document = result.document as TDocument;
    return this.document;
  }

  dispatchDocumentAction(action: Action) {
    const result = buildOperationAndDocument(
      this.reducer,
      this.document,
      action,
    );

    this.document = { ...result.document };
    this.unsyncedOperations.push({ ...result.operation });

    return result;
  }
}

export class DriveBasicClient<TDocument extends PHDocument = PHDocument> {
  private unsyncedOperations: Operation[] = [];

  constructor(
    private server: IDocumentDriveServer,
    private driveId: string,
    private document: TDocument,
    private reducer: PHReducer<TDocument>,
  ) {}

  getDocument(): TDocument {
    return this.document;
  }

  getUnsyncedOperations() {
    return this.unsyncedOperations;
  }

  setUnsyncedOperations(operations: Operation[]) {
    this.unsyncedOperations = operations;
  }

  clearUnsyncedOperations() {
    this.unsyncedOperations = [];
  }

  async pushOperationsToServer() {
    const result = await this.server.addOperations(
      this.driveId,
      this.unsyncedOperations,
    );

    if (result.status === "SUCCESS") {
      this.unsyncedOperations = [];
    }

    return result;
  }

  async syncDocument() {
    this.clearUnsyncedOperations();

    const remoteDocument = await this.server.getDrive(this.driveId);

    const remoteDocumentOperations = Object.values(
      remoteDocument.operations,
    ).flat() as Operation[];

    const result = await (
      this.server as unknown as BaseDocumentDriveServer
    )._processOperations(this.driveId, this.document, remoteDocumentOperations);

    this.document = result.document as TDocument;
    return this.document;
  }

  dispatchDriveAction(action: Action) {
    const result = buildOperationAndDocument(
      this.reducer,
      this.document,
      action,
    );

    this.document = { ...result.document };
    this.unsyncedOperations.push({ ...result.operation });

    return result;
  }
}
