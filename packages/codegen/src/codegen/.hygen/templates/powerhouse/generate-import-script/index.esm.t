---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/index.ts"
force: true
---
import { IBaseDocumentDriveServer } from "document-drive";
import { actions } from "document-model";
import {
  addDocument,
  addFolder,
  initReactorWithRemoteDrive
} from "./utils";

async function main() {
  const driveServer = (await initReactorWithRemoteDrive(
    "http://localhost:4001/d/powerhouse"
  )) as IBaseDocumentDriveServer;

  const driveIds = await driveServer.getDrives();
  let drive = await driveServer.getDrive(driveIds[0]);

  // add folder to root
  await addFolder(driveServer, driveIds[0], "example-folder", "Example Folder");
  drive = await driveServer.getDrive(driveIds[0]);

  // get root folder
  const rootDirId = drive.state.global.nodes.find(
    (e) => e.name === "Example Folder"
  );

  // check if root folder exists and throw error if it doesn't
  if (!rootDirId) {
    throw new Error("Root directory not found");
  }

  // add document to root folder
  await addDocument(
    driveServer,
    driveIds[0],
    "example-document",
    "Example Document",
    "powerhouse/document-model",
    rootDirId.id
  );

  // set model name to example document
  await driveServer.addAction(
    driveIds[0],
    "example-document",
    actions.setModelName({
      name: "Example Document",
    })
  );

  // get document
  const document = await driveServer.getDocument(driveIds[0], "example-document");
  console.log(document.state.global);

  process.exit(0);
}
