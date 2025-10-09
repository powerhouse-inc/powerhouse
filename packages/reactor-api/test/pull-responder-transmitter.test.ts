import {
  createDriveHandlers,
  expectUUID,
  getDocumentScopeIndexes,
  testSetupReactor,
} from "@powerhousedao/reactor-api/test";
import type {
  DocumentDriveDocument,
  IDocumentDriveServer,
  Listener,
} from "document-drive";
import { PullResponderTransmitter, addFile, addFolder } from "document-drive";
import type { DocumentModelDocument } from "document-model";
import { documentModelCreateDocument, setAuthorName } from "document-model";
import { generateId } from "document-model/core";
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
    const { listenerManager } = await testSetupReactor();
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

    await vi.waitFor(
      async () => {
        const drive = await reactor.getDrive(driveId);
        expect(getDocumentScopeIndexes(drive)).toStrictEqual({
          global: 0,
          local: -1,
        });

        const resultDrive = result.document as DocumentDriveDocument;
        expect(drive.state.global).toStrictEqual(resultDrive.state.global);
      },
      {
        timeout: 1000,
      },
    );

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
    const newDocument = documentModelCreateDocument();
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
      const resultDrive = result.document as DocumentDriveDocument;
      expect(drive.state.global).toStrictEqual(resultDrive.state.global);
    });

    await vi.waitFor(async () => {
      const document = (await reactor.getDocument(
        documentId,
      )) as DocumentModelDocument;
      expect(getDocumentScopeIndexes(document)).toStrictEqual({
        global: -1,
        local: -1,
      });
      const remoteDocument = (await remoteReactor.getDocument(
        documentId,
      )) as DocumentModelDocument;
      expect(document.state.global).toStrictEqual(remoteDocument.state.global);
    });

    await reactor.deleteDrive(driveId);
  });

  it("should push new document with operations to remote reactor", async () => {
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
    const newDocument = documentModelCreateDocument();
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
      const document = (await reactor.getDocument(
        documentId,
      )) as DocumentModelDocument;
      expect(getDocumentScopeIndexes(document)).toStrictEqual({
        global: 0,
        local: -1,
      });
      const resultDocument = result.document as DocumentDriveDocument;
      expect(document.state.global).toStrictEqual(resultDocument.state.global);
    });

    await reactor.deleteDrive(driveId);
  });

  it("should persist triggers in drive storage and retrieve them correctly", async () => {
    const { reactor } = await testSetupReactor();
    const trigger = await setupTrigger();

    // Create a drive with triggers and listeners
    const testListeners = [
      {
        listenerId: "test-listener-1",
        label: "Test Listener",
        version: "1.0.0",
        url: "https://example.com/listener",
        system: false,
        status: "CONNECTING" as const,
        block: false,
        callInfo: {
          data: "",
          name: "Test Listener",
          transmitterType: "PullResponder",
        },
        filter: {
          documentType: ["*"],
          documentId: ["*"],
          scope: ["global"],
          branch: ["main"],
        },
      },
    ];

    const createdDrive = await reactor.addDrive({
      id: generateId(),
      global: {
        name: "Test Drive with Triggers",
        icon: null,
      },
      local: {
        availableOffline: true,
        triggers: [trigger],
        listeners: testListeners as Listener[],
        sharingType: "private",
      },
    });

    const createdDriveId = createdDrive.header.id;

    // Verify initial state has triggers and listeners
    expect(createdDrive.state.local.triggers).toHaveLength(1);
    expect(createdDrive.state.local.triggers[0].id).toBe(trigger.id);
    expect(createdDrive.state.local.listeners).toHaveLength(1);
    expect(createdDrive.state.local.listeners[0].listenerId).toBe(
      testListeners[0].listenerId,
    );

    // Now retrieve the drive from storage (simulating a restart)
    const retrievedDrive = await reactor.getDrive(createdDriveId);

    // Verify that triggers and listeners are preserved after retrieval
    expect(retrievedDrive.state.local.triggers).toHaveLength(1);
    expect(retrievedDrive.state.local.triggers[0]).toStrictEqual(trigger);
    expect(retrievedDrive.state.local.listeners).toHaveLength(1);
    expect(retrievedDrive.state.local.listeners[0]).toStrictEqual(
      testListeners[0],
    );

    // Verify other local state is also preserved
    expect(retrievedDrive.state.local.availableOffline).toBe(true);
    expect(retrievedDrive.state.local.sharingType).toBe("private");

    // Clean up
    await reactor.deleteDrive(createdDriveId);
  });
});
