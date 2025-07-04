import {
  addFile,
  addFolder,
  driveDocumentModelModule,
  IDocumentDriveServer,
  PullResponderTransmitter,
  ReactorBuilder,
} from "document-drive";
import {
  documentModelDocumentModelModule,
  DocumentModelModule,
  generateId,
} from "document-model";
import { setupServer } from "msw/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDriveHandlers } from "./drive-handlers.js";
import { expectUUID } from "./utils.js";

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

  async function setupReactor() {
    const builder = new ReactorBuilder([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ] as DocumentModelModule[]);
    const reactor = await builder.build();
    await reactor.initialize();
    return { reactor, listenerManager: builder.listenerManager! };
  }

  async function setupTrigger() {
    const { reactor, listenerManager } = await setupReactor();
    return PullResponderTransmitter.createPullResponderTrigger(
      driveId,
      remoteUrl,
      triggerOptions,
      listenerManager,
    );
  }

  beforeEach(async () => {
    const { reactor } = await setupReactor();
    const drive = await reactor.addDrive(remoteDrive);
    remoteReactor = reactor;

    server = setupServer(...createDriveHandlers(reactor, drive.id));
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
    const { reactor } = await setupReactor();
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
      expect(drive.revision).toStrictEqual({ global: 1, local: 0 });
      expect(drive.state.global).toStrictEqual(result.document?.state.global);
    });

    await reactor.deleteDrive(driveId);
  });

  it("should push new document to remote reactor", async () => {
    const { reactor } = await setupReactor();
    const trigger = await setupTrigger();
    await reactor.addDrive({
      id: driveId,
      global: remoteDrive.global,
      local: {
        availableOffline: true,
        triggers: [trigger],
      },
    });
    const documentId = generateId();
    const document = await remoteReactor.addDocument(
      documentModelDocumentModelModule.utils.createDocument({
        id: documentId,
      }),
    );

    const result = await remoteReactor.queueAction(
      driveId,
      addFile({
        id: documentId,
        name: "test",
        documentType: document.documentType,
      }),
    );

    await vi.waitFor(async () => {
      const drive = await reactor.getDrive(driveId);
      expect(drive.revision).toStrictEqual({ global: 1, local: 0 });
      expect(drive.state.global).toStrictEqual(result.document?.state.global);
    });

    await vi.waitFor(async () => {
      const document = await reactor.getDocument(documentId);
      expect(document.revision).toStrictEqual({ global: 0, local: 0 });
      expect(document.state.global).toStrictEqual(document?.state.global);
    });

    await reactor.deleteDrive(driveId);
  });

  it("should push new document with operations to remote reactor", async () => {
    const { reactor } = await setupReactor();
    const trigger = await setupTrigger();
    await reactor.addDrive({
      id: driveId,
      global: remoteDrive.global,
      local: {
        availableOffline: true,
        triggers: [trigger],
      },
    });
    const documentId = generateId();
    const document = await remoteReactor.addDocument(
      documentModelDocumentModelModule.utils.createDocument({
        id: documentId,
      }),
    );
    const result = await remoteReactor.queueAction(
      documentId,
      documentModelDocumentModelModule.actions.setAuthorName({
        name: "test",
      }),
    );

    await remoteReactor.queueAction(
      driveId,
      addFile({
        id: documentId,
        name: "test",
        documentType: document.documentType,
      }),
    );

    await vi.waitFor(async () => {
      const document = await reactor.getDocument(documentId);
      expect(document.revision).toStrictEqual({ global: 1, local: 0 });
      expect(document.state.global).toStrictEqual(
        result.document?.state.global,
      );
    });

    await reactor.deleteDrive(driveId);
  });
});
