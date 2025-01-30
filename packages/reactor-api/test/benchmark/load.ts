import {
  DocumentDriveServer,
  generateUUID,
  type IDocumentDriveServer,
} from "document-drive";
import { MemoryStorage } from "document-drive/storage/memory";
import {
  DocumentDriveDocument,
  generateAddNodeAction,
} from "document-model-libs/document-drive";
import * as documentModelsMap from "document-model-libs/document-models";
import { Document, DocumentModel } from "document-model/document";
import {
  DocumentModelAction,
  DocumentModelLocalState,
  DocumentModelState,
  utils,
} from "document-model/document-model";
import { AddFileAction } from "node_modules/document-model-libs/dist/document-models/document-drive/gen";
import { exit } from "process";
import { Bench } from "tinybench";

const documentModels = Object.values(documentModelsMap) as DocumentModel[];

let document: Document<
  DocumentModelState,
  DocumentModelAction,
  DocumentModelLocalState
> | null = null;
let server: IDocumentDriveServer | null = null;
let drive: DocumentDriveDocument | null = null;
let action: AddFileAction | null = null;

async function beforeEach() {
  server = new DocumentDriveServer(documentModels, new MemoryStorage());
  await server.initialize();

  drive = await server.addDrive({
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

  action = generateAddNodeAction(
    drive.state.global,
    {
      id: generateUUID(),
      name: "Imported Document",
      documentType: document!.documentType,
      document: document,
    },
    ["global"]
  );
}

async function main() {
  document = await utils.loadFromFile("test/data/BlocktowerAndromeda.zip");

  const bench = new Bench();

  bench.add(
    "Load PHDM into Document Drive",
    async () => {
      const result = await server!.addDriveAction(
        drive!.state.global.id,
        action!
      );

      if (result.error) {
        throw new Error(result.error.message);
      }
    },
    {
      beforeEach: async () => await beforeEach(),
    }
  );

  await bench.run();

  console.table(bench.table());
}

main()
  .catch(console.error)
  .finally(() => exit(0));
