import {
  createDriveHandlers,
  expectUUID,
  getDocumentScopeIndexes,
  testSetupReactor,
} from "@powerhousedao/reactor-api";
import type { IDocumentDriveServer } from "document-drive";
import {
  addFile,
  addFolder,
  driveCreateDocument,
  driveDocumentModelModule,
  PullResponderTransmitter,
} from "document-drive";
import type { DocumentModelModule } from "document-model";
import {
  documentModelDocumentModelModule,
  generateId,
  setAuthorName,
} from "document-model";
import { setupServer } from "msw/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const remoteUrl = "http://test.com/d/test";

describe("Pull Responder Transmitter", () => {
  let server: ReturnType<typeof setupServer>;
  let remoteReactor: IDocumentDriveServer;

  const driveId = generateId();
  const remoteDrive = {
    id: driveId,
    global: {
      name: "Test Drive",
    },
  };

  const triggerOptions = {
    pullFilter: {
      branch: ["main"],
      documentId: ["*"],
      documentType: ["*"],
      scope: ["global"],
    },
    pullInterval: 50,
  };

  async function setupTrigger() {
    const { reactor, listenerManager } = await testSetupReactor();
    reactor.setDocumentModelModules([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ] as DocumentModelModule[]);
    return PullResponderTransmitter.createPullResponderTrigger(
      driveId,
      remoteUrl,
      triggerOptions,
      listenerManager,
    );
  }

  beforeEach(async () => {
    const { reactor } = await testSetupReactor();
    const drive = await reactor.addDrive(remoteDrive);
    remoteReactor = reactor;

    server = setupServer(...createDriveHandlers(reactor, drive.header.id));
    server.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => {
    server.resetHandlers(); // Reset any handlers overridden during a test
    server.close();
  });

  it("should register listener and create trigger", async () => {
    const trigger = await setupTrigger();

    expect(trigger).toStrictEqual({
      driveId: driveId,
      filter: triggerOptions.pullFilter,
      type: "PullResponder",
      id: expectUUID(expect),
      data: {
        interval: triggerOptions.pullInterval.toString(),
        listenerId: expectUUID(expect),
        url: remoteUrl,
      },
    });

    const remoteListener = remoteReactor.listeners.getListenerState(
      driveId,
      trigger.data.listenerId,
    );
    expect(remoteListener).toMatchObject({
      listener: {
        driveId: driveId,
        listenerId: trigger.data.listenerId,
        filter: triggerOptions.pullFilter,
      },
    });
  });

  it("should pull drive operation from remote reactor", async () => {
    const { reactor } = await testSetupReactor();
    const trigger = await setupTrigger();
    await reactor.addDrive({
      id: driveId,
      global: remoteDrive.global,
      local: {
        availableOffline: true,
        triggers: [trigger],
      },
    });

    const result = await remoteReactor.queueAction(
      driveId,
      addFolder({ id: generateId(), name: "test" }),
    );

    await vi.waitFor(async () => {
      const drive = await reactor.getDrive(driveId);
      expect(getDocumentScopeIndexes(drive)).toStrictEqual({
        global: 0,
        local: -1,
      });
      expect(drive.state.global).toStrictEqual(result.document?.state.global);
    });

    await reactor.deleteDrive(driveId);
  });

  it("should push new document to remote reactor", async () => {
    const { reactor } = await testSetupReactor();
    const trigger = await setupTrigger();
    await reactor.addDrive({
      id: driveId,
      global: remoteDrive.global,
      local: {
        availableOffline: true,
        triggers: [trigger],
      },
    });
    const newDocument = driveCreateDocument();
    const documentId = newDocument.header.id;
    const document = await remoteReactor.addDocument(newDocument);

    const result = await remoteReactor.queueAction(
      driveId,
      addFile({
        id: documentId,
        name: "test",
        documentType: document.header.documentType,
      }),
    );

    await vi.waitFor(async () => {
      const drive = await reactor.getDrive(driveId);
      expect(getDocumentScopeIndexes(drive)).toStrictEqual({
        global: 0,
        local: -1,
      });
      expect(drive.state.global).toStrictEqual(result.document?.state.global);
    });

    await vi.waitFor(async () => {
      const document = await reactor.getDocument(documentId);
      expect(getDocumentScopeIndexes(document)).toStrictEqual({
        global: -1,
        local: -1,
      });
      expect(document.state.global).toStrictEqual(document?.state.global);
    });

    await reactor.deleteDrive(driveId);
  });

  it("should push new document with operations to remote reactor", async () => {
    const { reactor } = await testSetupReactor();
    console.log("!!!!!!!!!!!!!", reactor.getDocumentModelModules());
    const trigger = await setupTrigger();
    await reactor.addDrive({
      id: driveId,
      global: remoteDrive.global,
      local: {
        availableOffline: true,
        triggers: [trigger],
      },
    });
    const newDocument = driveCreateDocument();
    const documentId = newDocument.header.id;
    const document = await remoteReactor.addDocument(newDocument);
    const result = await remoteReactor.queueAction(
      documentId,
      setAuthorName({
        authorName: "test",
      }),
    );

    await remoteReactor.queueAction(
      driveId,
      addFile({
        id: documentId,
        name: "test",
        documentType: document.header.documentType,
      }),
    );

    await vi.waitFor(async () => {
      const document = await reactor.getDocument(documentId);
      expect(getDocumentScopeIndexes(document)).toStrictEqual({
        global: 0,
        local: -1,
      });
      expect(document.state.global).toStrictEqual(
        result.document?.state.global,
      );
    });

    await reactor.deleteDrive(driveId);
  });
});
