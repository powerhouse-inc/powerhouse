import {
  addFile,
  addFolder,
  DocumentDriveDocument,
  driveDocumentModelModule,
  IDocumentDriveServer,
  ReactorBuilder,
  requestPublicDrive,
} from "document-drive";
import { SwitchboardPushTransmitter } from "document-drive/server/listener/transmitter/switchboard-push";
import { IListenerManager, Listener } from "document-drive/server/types";
import {
  DocumentModelDocument,
  documentModelDocumentModelModule,
  DocumentModelModule,
  generateId,
} from "document-model";
import { setupServer } from "msw/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDriveHandlers } from "./drive-handlers.js";
import { expectUTCTimestamp, getDocumentScopeIndexes } from "./utils.js";

const remoteUrl = "http://test.com/d/test";

describe("Push Transmitter", () => {
  let server: ReturnType<typeof setupServer>;
  let remoteReactor: IDocumentDriveServer;

  const remoteDrive = {
    id: generateId(),
    global: {
      name: "Test Drive",
    },
  };

  async function setupReactor() {
    const builder = new ReactorBuilder([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ] as unknown as DocumentModelModule[]);
    const reactor = builder.build();
    await reactor.initialize();
    return { reactor, listenerManager: builder.listenerManager! };
  }

  async function setupListener(listenerManager: IListenerManager) {
    const uuid = generateId();
    const listener: Listener = {
      driveId: remoteDrive.id,
      listenerId: uuid,
      block: false,
      filter: {
        branch: ["main"],
        documentId: ["*"],
        documentType: ["*"],
        scope: ["global"],
      },
      system: false,
      label: `SwitchboardPush #${uuid}`,
      callInfo: {
        data: remoteUrl,
        name: "SwitchboardPush",
        transmitterType: "SwitchboardPush",
      },
    };

    // TODO: circular reference
    listener.transmitter = new SwitchboardPushTransmitter(remoteUrl);
    await listenerManager?.setListener(remoteDrive.id, listener);

    return listener;
  }

  beforeEach(async () => {
    const { reactor } = await setupReactor();
    const drive = await reactor.addDrive(remoteDrive);
    remoteReactor = reactor;

    server = setupServer(...createDriveHandlers(reactor, drive.header.id));
    server.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => {
    server.resetHandlers(); // Reset any handlers overridden during a test
    server.close();
  });

  it("should return drive data", async () => {
    const driveInfo = await requestPublicDrive(remoteUrl);
    expect(driveInfo).toStrictEqual({
      id: remoteDrive.id,
      slug: remoteDrive.id,
      name: remoteDrive.global.name,
      meta: {},
    });
  });

  it("should push drive operation to remote reactor", async () => {
    const { reactor, listenerManager } = await setupReactor();
    const { id: driveId, name } = await requestPublicDrive(remoteUrl);
    await reactor.addDrive({ id: driveId, global: { name } });

    const listener = await setupListener(listenerManager);

    const result = await reactor.queueAction(
      driveId,
      addFolder({ id: generateId(), name: "test" }),
    );

    await vi.waitFor(async () => {
      const remoteDrive = await remoteReactor.getDrive(driveId);
      expect(getDocumentScopeIndexes(remoteDrive)).toStrictEqual({
        global: 0,
        local: -1,
      });
      const resultDrive = result.document as DocumentDriveDocument;
      expect(remoteDrive.state.global).toStrictEqual(resultDrive.state.global);
    });

    const syncUnits = listenerManager?.getListenerState(
      driveId,
      listener.listenerId,
    ).syncUnits!;
    expect(
      syncUnits.get({
        documentId: driveId,
        scope: "global",
        branch: "main",
      }),
    ).toStrictEqual({
      listenerRev: 1,
      lastUpdated: expectUTCTimestamp(expect),
    });

    expect(
      syncUnits.get({
        documentId: driveId,
        scope: "local",
        branch: "main",
      }),
    ).toBeUndefined();
  });

  it("should push new document to remote reactor", async () => {
    const { reactor, listenerManager } = await setupReactor();
    const { id: driveId, name } = await requestPublicDrive(remoteUrl);
    await reactor.addDrive({ id: driveId, global: { name } });

    const listener = await setupListener(listenerManager);
    const newDocument = documentModelDocumentModelModule.utils.createDocument();
    const documentId = newDocument.header.id;
    const document = await reactor.addDocument(newDocument);

    const result = await reactor.queueAction(
      driveId,
      addFile({
        id: documentId,
        name: "test",
        documentType: document.header.documentType,
      }),
    );

    await vi.waitFor(async () => {
      const remoteDrive = await remoteReactor.getDrive(driveId);
      expect(getDocumentScopeIndexes(remoteDrive)).toStrictEqual({
        global: 0,
        local: -1,
      });
      const resultDrive = result.document as DocumentDriveDocument;
      expect(remoteDrive.state.global).toStrictEqual(resultDrive.state.global);
    });

    await vi.waitFor(async () => {
      const remoteDocument = (await remoteReactor.getDocument(
        documentId,
      )) as DocumentModelDocument;
      expect(getDocumentScopeIndexes(remoteDocument)).toStrictEqual({
        global: -1,
        local: -1,
      });
      const resultDocument = document as DocumentModelDocument;
      expect(remoteDocument.state.global).toStrictEqual(
        resultDocument.state.global,
      );
    });

    const syncUnits = listenerManager?.getListenerState(
      driveId,
      listener.listenerId,
    ).syncUnits!;
    expect(
      syncUnits.get({
        documentId,
        scope: "global",
        branch: "main",
      }),
    ).toStrictEqual({
      listenerRev: 0,
      lastUpdated: expectUTCTimestamp(expect),
    });

    expect(
      syncUnits.get({
        documentId,
        scope: "local",
        branch: "main",
      }),
    ).toBeUndefined();
  });

  it("should push new document with operations to remote reactor", async () => {
    const { reactor, listenerManager } = await setupReactor();
    const { id: driveId, name } = await requestPublicDrive(remoteUrl);
    await reactor.addDrive({ id: driveId, global: { name } });

    const listener = await setupListener(listenerManager);
    const newDocument = documentModelDocumentModelModule.utils.createDocument();
    const documentId = newDocument.header.id;
    const document = await reactor.addDocument(newDocument);
    const result = await reactor.queueAction(
      documentId,
      documentModelDocumentModelModule.actions.setAuthorName({
        authorName: "test",
      }),
    );

    await reactor.queueAction(
      driveId,
      addFile({
        id: documentId,
        name: "test",
        documentType: document.header.documentType,
      }),
    );

    await vi.waitFor(async () => {
      const remoteDocument = (await remoteReactor.getDocument(
        documentId,
      )) as DocumentModelDocument;
      expect(getDocumentScopeIndexes(remoteDocument)).toStrictEqual({
        global: 0,
        local: -1,
      });
      const resultDocument = result.document as DocumentDriveDocument;
      expect(remoteDocument.state.global).toStrictEqual(
        resultDocument.state.global,
      );
    });

    const syncUnits = listenerManager?.getListenerState(
      driveId,
      listener.listenerId,
    ).syncUnits!;
    expect(
      syncUnits.get({
        documentId,
        scope: "global",
        branch: "main",
      }),
    ).toStrictEqual({
      listenerRev: 1,
      lastUpdated: expectUTCTimestamp(expect),
    });

    expect(
      syncUnits.get({
        documentId,
        scope: "local",
        branch: "main",
      }),
    ).toBeUndefined();
  });
});
