import { DocumentDriveAction } from "document-model-libs/document-drive";
import {
  Action,
  BaseAction,
  Document,
  NOOPAction,
  Operation,
  Reducer,
} from "document-model/document";
import { DocumentModelDocument } from "document-model/document-model";
import { ExpectStatic } from "vitest";
import { BaseDocumentDriveServer } from "../src";

export function expectUUID(expect: ExpectStatic): unknown {
  return expect.stringMatching(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
}

export function expectUTCTimestamp(expect: ExpectStatic): unknown {
  return expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/i);
}

export function buildOperation(
  reducer: Reducer<any, any, any>,

  document: Document<any, any, any>,
  action: Action,
  index?: number,
): Operation<NOOPAction & Action> {
  const newDocument = reducer(document, action);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const operation = newDocument.operations[action.scope]
    .slice()
    .pop()! as Operation;

  return { ...operation, index: index ?? operation.index } as Operation<
    NOOPAction & Action
  >;
}

export function buildOperations(
  reducer: Reducer<any, any, any>,

  document: Document<any, any, any>,

  actions: Array<Action>,
): Operation<NOOPAction & Action>[] {
  const operations: Operation<NOOPAction & Action>[] = [];
  for (const action of actions) {
    document = reducer(document, action);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const operation = document.operations[action.scope]
      .slice()
      .pop()! as Operation<NOOPAction & Action>;
    operations.push(operation);
  }
  return operations;
}

export function buildOperationAndDocument(
  reducer: Reducer<any, any, any>,

  document: Document<any, any, any>,
  action: Action,
  index?: number,
) {
  const newDocument = reducer(document, action);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const operation = newDocument.operations[action.scope]
    .slice()
    .pop()! as Operation;

  return {
    document: newDocument,
    operation: {
      ...operation,
      index: index ?? operation.index,
    } as Operation<NOOPAction & Action>,
  };
}

export class BasicClient {
  private unsyncedOperations: Operation[] = [];

  constructor(
    private server: BaseDocumentDriveServer,
    private driveId: string,
    private documentId: string,

    private document: Document<any, any, any>,

    private reducer: Reducer<any, any, any>,
  ) {}

  getDocument() {
    return this.document;
  }

  clearUnsyncedOperations() {
    this.unsyncedOperations = [];
  }

  async pushOperationsToServer() {
    const result = await this.server.addOperations(
      this.driveId,
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

    const remoteDocument = (await this.server.getDocument(
      this.driveId,
      this.documentId,
    )) as DocumentModelDocument;

    const remoteDocumentOperations = Object.values(
      remoteDocument.operations,
    ).flat();

    const result = await this.server._processOperations(
      this.driveId,
      this.documentId,
      this.document,
      remoteDocumentOperations,
    );

    this.document = result.document;
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

export class DriveBasicClient {
  private unsyncedOperations: Operation<DocumentDriveAction | BaseAction>[] =
    [];

  constructor(
    private server: BaseDocumentDriveServer,
    private driveId: string,

    private document: Document<any, any, any>,

    private reducer: Reducer<any, any, any>,
  ) {}

  getDocument() {
    return this.document;
  }

  getUnsyncedOperations() {
    return this.unsyncedOperations;
  }

  setUnsyncedOperations(
    operations: Operation<DocumentDriveAction | BaseAction>[],
  ) {
    this.unsyncedOperations = operations;
  }

  clearUnsyncedOperations() {
    this.unsyncedOperations = [];
  }

  async pushOperationsToServer() {
    const result = await this.server.addDriveOperations(
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
    ).flat();

    const result = await this.server._processOperations(
      this.driveId,
      undefined,
      this.document,
      remoteDocumentOperations,
    );

    this.document = result.document;
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
