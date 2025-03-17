// import { RealWorldAssets } from "@sky-ph/atlas/document-models";
// import { generateUUID, ReactorBuilder } from "document-drive";
// import {
//   DocumentDriveServer,
//   driveDocumentModelModule,
//   generateAddNodeAction,
//   generateUUID,
//   MemoryStorage,
// } from "document-drive";
// import { DocumentModelModule } from "document-model";

// import { bench, describe } from "vitest";

// describe("Document Drive", async () => {
//   const documentModels = [
//     driveDocumentModelModule,
//     RealWorldAssets,
//   ] as DocumentModelModule[];
//   const document = await RealWorldAssets.utils.loadFromFile(
//     "test/data/BlocktowerAndromeda.zip",
//   );

//   bench(
//     "Load PHDM into Document Drive",
//     async () => {
//       const server = new ReactorBuilder(documentModels).build();
//       await server.initialize();

//       const driveId = generateUUID();
//       const documentId = generateUUID();

//       const drive = await server.addDrive({
//         global: {
//           id: driveId,
//           name: "Test Drive",
//           icon: null,
//           slug: null,
//         },
//         local: {
//           availableOffline: false,
//           sharingType: "PRIVATE",
//           listeners: [],
//           triggers: [],
//         },
//       });

//       // adds file node for document
//       const addFileAction = generateAddNodeAction(
//         drive.state.global,
//         {
//           documentType: document.documentType,
//           id: documentId,
//           name: "BlocktowerAndromeda",
//         },
//         ["global"],
//       );
//       await server.addDriveAction(driveId, addFileAction);

//       // adds document operations
//       const result = await server.addOperations(
//         driveId,
//         documentId,
//         document.operations.global,
//       );

//       if (result.error) {
//         throw result.error;
//       }

//       const lastOperation = document.operations.global.at(-1);
//       const lastLoadedOperation = result.operations.at(-1);
//       if (
//         JSON.stringify(lastOperation) !== JSON.stringify(lastLoadedOperation)
//       ) {
//         throw new Error("Document operations  mismatch");
//       }
//     },
//     { throws: true },
//   );
// });
