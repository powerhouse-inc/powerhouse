import { DocumentModelDocument, DocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { reducer } from "../../src/drive-document-model/gen/reducer.js";
import { ReactorBuilder } from "../../src/server/base.js";
import { MemoryStorage } from "../../src/storage/memory.js";

const SWITCHBOARD_URL = process.env.SWITCHBOARD_URL ?? "http://localhost:3000/";

function buildSwitchboardUrl(endpoint: string) {
  return new URL(endpoint, SWITCHBOARD_URL).href;
}

describe("Document Drive Server with remote switchboard instance", async () => {
  const switchboardAvailable = await fetch(buildSwitchboardUrl("healthz"))
    .then((r) => r.ok && r.json())
    .then((r) => r.status === "healthy")
    .catch(() => false);

  const documentModels = [
    DocumentModelLib,
    ...Object.values(DocumentModelsLibs),
  ] as DocumentModelModule<any>[];

  const storageLayer = new MemoryStorage();

  beforeEach(async () => {
    vi.useFakeTimers().setSystemTime(new Date("2024-01-01"));
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  const itAvailable = switchboardAvailable ? it : it.skip;

  itAvailable(
    "should push to remote switchboard if remoteDriveUrl is set",
    async ({ expect }) => {
      const server = new ReactorBuilder(documentModels)
        .withStorage(storageLayer)
        .build();
      await server.initialize();
      await server.addDrive({
        global: {
          id: "1",
          name: "Monetalis",
          icon: null,
          slug: null,
        },
        local: {
          availableOffline: false,
          sharingType: "public",
          triggers: [],
          listeners: [
            {
              block: true,
              callInfo: {
                data: buildSwitchboardUrl("d/1"),
                name: "switchboard-push",
                transmitterType: "SwitchboardPush",
              },
              filter: {
                branch: ["main"],
                documentId: ["*"],
                documentType: ["*"],
                scope: ["global", "local"],
              },
              label: "Switchboard Sync",
              listenerId: "1",
              system: true,
            },
          ],
        },
      });
      let drive = await server.getDrive("1");

      // adds file
      drive = reducer(
        drive,
        actions.addFile({
          id: "1.1",
          name: "document 1",
          documentType: "powerhouse/document-model",
          scopes: ["global", "local"],
        }),
      );

      const addFileResult = await server.addDriveOperation(
        "1",
        drive.operations.global[0]!,
      );

      expect(addFileResult.error).toBeUndefined();
      expect(addFileResult.status).toBe("SUCCESS");

      let document = (await server.getDocument(
        "1",
        "1.1",
      )) as DocumentModelDocument;
      document = DocumentModelLib.reducer(
        document,
        DocumentModelActions.setAuthorName({ authorName: "test" }),
      );

      const operation = document.operations.global[0]!;
      const result = await server.addOperation("1", "1.1", operation);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe("SUCCESS");
    },
  );

  it("should pull from remote switchboard if remoteDriveUrl is set", async ({
    expect,
  }) => {
    // Connect document drive server
    const server = new ReactorBuilder(documentModels)
      .withStorage(storageLayer)
      .build();
    await server.initialize();
    try {
      await server.addRemoteDrive(buildSwitchboardUrl("d/1"), {
        availableOffline: true,
        sharingType: "public",
        listeners: [],
        triggers: [],
      });
    } catch (e) {
      console.error(e);
    }

    vi.advanceTimersToNextTimer();
    vi.advanceTimersToNextTimer();

    const drive = await vi.waitFor(
      async () => {
        const drive = await server.getDrive("1");
        expect(drive.operations.global.length).toBeTruthy();
        return drive;
      },
      {
        timeout: 1500,
        interval: 20,
      },
    );

    expect(drive.operations.global[0]).toMatchObject({
      index: 0,
      skip: 0,
      type: "ADD_FILE",
      scope: "global",
      branch: "main",
      hash: "+oWJspzrQnYtIYN+ceBaV+pgy0g=",
      timestampUtcMs: expect.stringMatching(
        /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)/,
      ),
      input: {
        id: "1.1",
        name: "document 1",
        documentType: "powerhouse/document-model",
        scopes: ["global", "local"],
      },
    });

    const document = await vi.waitFor(
      async () => {
        const document = (await server.getDocument(
          "1",
          "1.1",
        )) as DocumentModelDocument;
        expect(document.operations.global.length).toBeTruthy();
        return document;
      },
      {
        timeout: 500,
        interval: 20,
      },
    );

    expect(document.state.global.author.name).toBe("test");
  });
});
