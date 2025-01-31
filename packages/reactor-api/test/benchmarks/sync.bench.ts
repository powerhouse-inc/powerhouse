import {
  DocumentDriveServer,
  generateUUID,
  type IDocumentDriveServer,
} from "document-drive";
import { MemoryStorage } from "document-drive/storage/memory";
import {
  actions,
  DocumentDriveDocument,
  generateAddNodeAction,
  Listener,
  TransmitterType,
} from "document-model-libs/document-drive";
import * as documentModelsMap from "document-model-libs/document-models";
import { Document, DocumentModel } from "document-model/document";
import {
  DocumentModelAction,
  DocumentModelLocalState,
  DocumentModelState,
  utils,
} from "document-model/document-model";
import { processGetStrands, processPushUpdate } from "src/sync/utils";

let documentModels: DocumentModel[];
let document: Document<
  DocumentModelState,
  DocumentModelAction,
  DocumentModelLocalState
> | null = null;
let serverA: IDocumentDriveServer | null = null;
let serverB: IDocumentDriveServer | null = null;
let driveA: DocumentDriveDocument | null = null;
let driveB: DocumentDriveDocument | null = null;

let serverAListenerId: string | null = null;

const initialize = async () => {
  documentModels = Object.values(documentModelsMap) as DocumentModel[];

  document = await utils.loadFromFile("test/data/BlocktowerAndromeda.zip");
};

const prepRun = async () => {
  // create server A
  serverA = new DocumentDriveServer(documentModels, new MemoryStorage());
  await serverA.initialize();

  // create drive
  driveA = await serverA.addDrive({
    global: {
      id: generateUUID(),
      name: "Test Drive",
      icon: null,
      slug: null,
    },
    local: {
      availableOffline: false,
      sharingType: "PRIVATE",
      listeners: [],
      triggers: [],
    },
  });

  // create a listener
  serverAListenerId = generateUUID();
  const listener: Listener = {
    block: false,
    callInfo: {
      data: "",
      name: "PullResponder",
      transmitterType: "PullResponder" as TransmitterType,
    },
    filter: {
      branch: ["main"],
      documentId: ["*"],
      documentType: ["*"],
      scope: ["*"],
    },
    label: `Pullresponder #${serverAListenerId}`,
    listenerId: serverAListenerId,
    system: false,
  };

  await serverA.queueDriveAction(
    driveA!.state.global.id,
    actions.addListener({ listener })
  );

  // create server B
  serverB = new DocumentDriveServer(documentModels, new MemoryStorage());
  await serverB.initialize();

  // create drive on server B
  driveB = await serverB.addDrive({
    global: {
      id: generateUUID(),
      name: "Test Drive",
      icon: null,
      slug: null,
    },
    local: {
      availableOffline: false,
      sharingType: "PRIVATE",
      listeners: [],
      triggers: [],
    },
  });
};

const run = async () =>
  new Promise((resolve, rej) => {
    // import into server A, but do not wait for it to complete
    let isServerAImportComplete = false;
    let serverAOperationCount = 0;
    serverA!
      .addDriveAction(
        driveA!.state.global.id,
        generateAddNodeAction(
          driveA!.state.global,
          {
            id: generateUUID(),
            name: "Imported Document",
            documentType: document!.documentType,
            document: document,
          },
          ["global"]
        )
      )
      .then((res) => {
        isServerAImportComplete = true;
        serverAOperationCount = res.document?.operations.global.length ?? 0;

        console.log("Server A import complete.");
      });

    console.log("Started import.");

    // loop until the document is imported
    let since: string | undefined = undefined;
    const poll = async () => {
      // wait for poll interval
      await new Promise((resolve) => setTimeout(resolve, 100));

      console.log("Poll.");

      // pull from server A
      let strands;
      try {
        strands = await processGetStrands(
          serverA!,
          driveA!.state.global.id,
          serverAListenerId!,
          since
        );
      } catch (e) {
        console.error(e);
        rej(e);
        return;
      }

      console.log(`Pushing ${strands.length} strands to server B.`);

      const updates = strands.map((strand) => ({
        operations: strand.operations.map((op) => ({
          ...op,
          scope: strand.scope,
          branch: strand.branch,
        })),
        documentId: strand.documentId,
        driveId: driveB!.state.global.id,
        scope: strand.scope,
        branch: strand.branch,
      }));

      // push to server B
      try {
        await Promise.all(
          updates.map((update) => processPushUpdate(serverB!, update))
        );
      } catch (e) {
        console.error(e);
        rej(e);
        return;
      }

      console.log(`Pushed ${strands.length} strands to server B.`);

      // no more updates
      if (strands.length !== 0) {
        // get the latest timestamp on the strand operations
        let latestTimestamp = new Date("1970-01-01T00:00:00Z");
        for (const strand of strands) {
          for (const operation of strand.operations) {
            if (new Date(operation.timestamp) > latestTimestamp) {
              latestTimestamp = new Date(operation.timestamp);
            }
          }
        }

        since = latestTimestamp.toISOString();
      }

      // check that BOTH servers are done importing
      if (isServerAImportComplete) {
        console.log("Server A import complete. Checking server B.");

        let serverBDocument;
        try {
          serverBDocument = await serverB?.getDocument(
            driveB!.state.global.id,
            document!.state.global.id
          );
        } catch (e) {
          console.error(e);
          rej(e);
          return;
        }

        if (
          serverBDocument?.operations.global.length === serverAOperationCount
        ) {
          console.log("Server B import complete. Done.");

          resolve(void 0);
          return;
        } else {
          console.log("Server B import not complete. Polling again.");

          poll();
        }
      }
    };

    poll();
  });

/*
beforeAll(initialize);

describe("Document Drive", () => {
  bench("Load PHDM into Document Drive", run, {
    setup: prepRun,
  });
});
*/

const main = async () => {
  await initialize();
  await prepRun();
  await run();
};

main();
