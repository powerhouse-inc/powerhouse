---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/utils.ts"
unless_exists: true
---
import { randomUUID } from "crypto";
import { DocumentDriveServer, IBaseDocumentDriveServer } from "document-drive";
import {
  actions,
  generateSynchronizationUnits
} from "document-model-libs/document-drive";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import { DocumentModel } from "document-model/document";
import { module as DocumentModelLib } from "document-model/document-model";
import * as LocalDocumentModels from "../../document-models";

export const addFolder = (
  driveServer: IBaseDocumentDriveServer,
  driveId: string,
  nodeId: string,
  nodeName: string,
  parentFolder: string | undefined = undefined
) => {
  return driveServer.addDriveAction(
    driveId,
    actions.addFolder({
      id: nodeId,
      name: nodeName,
      parentFolder: parentFolder,
    })
  );
};

export const addDocument = async (
  driveServer: IBaseDocumentDriveServer,
  driveId: string,
  documentId: string,
  documentName: string,
  documentType: string,
  parentFolder: string
) => {
  const drive = await driveServer.getDrive(driveId);
  return driveServer.addDriveAction(
    driveId,
    actions.addFile({
      documentType,
      id: documentId,
      name: documentName,
      parentFolder,
      synchronizationUnits: generateSynchronizationUnits(drive.state.global, [
        "global",
      ]),
    })
  );
};

export const initReactorWithRemoteDrive = async (driveUrl: string) => {
  const documentModels = [
    DocumentModelLib,
    ...Object.values(LocalDocumentModels),
    ...Object.values(DocumentModelsLibs),
  ] as DocumentModel[];
  const driveServer = new DocumentDriveServer(documentModels);
  await driveServer.initialize();
  return new Promise((resolve, reject) => {
    // init drive server with document models
    const listenerId = randomUUID();
    driveServer.addRemoteDrive(driveUrl, {
      availableOffline: true,
      listeners: [
        {
          block: true,
          callInfo: {
            data: driveUrl,
            name: "switchboard-push",
            transmitterType: "SwitchboardPush",
          },
          filter: {
            branch: ["main"],
            documentId: ["*"],
            documentType: ["*"],
            scope: ["global"],
          },
          label: "Switchboard Sync",
          listenerId,
          system: true,
        },
      ],
      sharingType: "public",
      triggers: [],
      pullInterval: 100,
    });

    driveServer.on("syncStatus", (driveId, status, error, syncUnitStatus) => {
      if (driveId !== driveId.split("/").pop() || status !== "SUCCESS") {
        return;
      }
      return resolve(driveServer);
    });
  });
};
