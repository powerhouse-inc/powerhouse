import {
  Action,
  CustomAction,
  DocumentModelDocument,
  Operation,
  PHDocument,
  Reducer,
} from "document-model";
import { ExpectStatic } from "vitest";
import { BaseDocumentDriveServer } from "../src/server/base.js";

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

  document: PHDocument,
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

export function buildOperations(
  reducer: Reducer<any, any, any>,

  document: PHDocument,

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

export function buildOperationAndDocument<
  TGlobalState,
  TLocalState,
  TAction extends CustomAction = Action,
>(
  reducer: Reducer<TGlobalState, TLocalState, TAction>,
  document: PHDocument<TGlobalState, TLocalState, TAction>,
  action: TAction,
  index?: number,
): {
  document: PHDocument<TGlobalState, TLocalState, TAction>;
  operation: Operation<TAction>;
} {
  const newDocument = reducer(document, action);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const operation = newDocument.operations[action.scope]
    .slice()
    .pop()! as Operation<TAction>;

  return {
    document: newDocument as PHDocument<TGlobalState, TLocalState, TAction>,
    operation: {
      ...operation,
      index: index ?? operation.index,
    } as Operation<TAction>,
  };
}

export class BasicClient {
  private unsyncedOperations: Operation[] = [];

  constructor(
    private server: BaseDocumentDriveServer,
    private driveId: string,
    private documentId: string,

    private document: PHDocument,

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
    ) as {
      document: PHDocument;
      operation: Operation;
    };

    this.document = { ...result.document };
    this.unsyncedOperations.push({ ...result.operation });

    return result;
  }
}

export class DriveBasicClient {
  private unsyncedOperations: Operation[] = [];

  constructor(
    private server: BaseDocumentDriveServer,
    private driveId: string,

    private document: PHDocument,

    private reducer: Reducer<any, any, any>,
  ) {}

  getDocument() {
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
    ) as {
      document: PHDocument;
      operation: Operation;
    };

    this.document = { ...result.document };
    this.unsyncedOperations.push({ ...result.operation });

    return result;
  }
}
