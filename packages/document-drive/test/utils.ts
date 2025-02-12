import { DocumentDriveAction } from "@drive-document-model";
import { BaseDocumentDriveServer } from "@server/base";
import { BaseDocument, BaseAction, NOOPAction, Reducer, Operation } from "document-model";
import { DocumentModelDocument } from "document-model/document-model";
import { ExpectStatic } from "vitest";

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

  document: BaseDocument<any, any, any>,
  action: BaseAction,
  index?: number,
): Operation<any, any, NOOPAction & BaseAction> {
  const newDocument = reducer(document, action);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const operation = newDocument.operations[action.scope]
    .slice()
    .pop()! as Operation<any, any, NOOPAction & BaseAction>;

  return { ...operation, index: index ?? operation.index } as Operation<
    any,
    any,
    NOOPAction & BaseAction
  >;
}

export function buildOperations(
  reducer: Reducer<any, any, any>,

  document: BaseDocument<any, any, any>,

  actions: Array<BaseAction>,
): Operation<any, any, NOOPAction & BaseAction>[] {
  const operations: Operation<any, any, NOOPAction & BaseAction>[] = [];
  for (const action of actions) {
    document = reducer(document, action);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const operation = document.operations[action.scope]
      .slice()
      .pop()! as Operation<any, any, NOOPAction & BaseAction>;
    operations.push(operation);
  }
  return operations;
}

export function buildOperationAndDocument(
  reducer: Reducer<any, any, any>,

  document: BaseDocument<any, any, any>,
  action: BaseAction,
  index?: number,
) {
  const newDocument = reducer(document, action);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const operation = newDocument.operations[action.scope]
    .slice()
    .pop()! as Operation<any, any, NOOPAction & BaseAction>;

  return {
    document: newDocument,
    operation: {
      ...operation,
      index: index ?? operation.index,
    } as Operation<any, any, NOOPAction & BaseAction>,
  };
}

export class BasicClient {
  private unsyncedOperations: Operation<any, any, NOOPAction & BaseAction>[] =
    [];

  constructor(
    private server: BaseDocumentDriveServer,
    private driveId: string,
    private documentId: string,

    private document: BaseDocument<any, any, any>,

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

  dispatchDocumentAction(action: BaseAction) {
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
  private unsyncedOperations: Operation<any, any, DocumentDriveAction | BaseAction>[] =
    [];

  constructor(
    private server: BaseDocumentDriveServer,
    private driveId: string,

    private document: BaseDocument<any, any, any>,

    private reducer: Reducer<any, any, any>,
  ) {}

  getDocument() {
    return this.document;
  }

  getUnsyncedOperations() {
    return this.unsyncedOperations;
  }

  setUnsyncedOperations(
    operations: Operation<any, any, DocumentDriveAction | BaseAction>[],
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

  dispatchDriveAction(action: BaseAction) {
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
