import type { BaseDocumentDriveServer } from "document-drive";
import {
  addFile,
  driveDocumentModelModule,
} from "document-drive";
import type { Action, DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { vi } from "vitest";
import type { Reactor } from "../../../src/core/reactor.js";
import type { BatchMutationRequest } from "../../../src/core/types.js";
import { JobStatus } from "../../../src/shared/types.js";

import * as atlasModels from "@sky-ph/atlas/document-models";
import { v4 as uuidv4 } from "uuid";

export interface RecordedOperation {
  type: string;
  name: string;
  timestamp: string;
  args: Record<string, any>;
}

export function wrapAtlasModule(module: any): DocumentModelModule<any> {
  if (module.documentModel?.global?.id) {
    return module;
  }

  return {
    ...module,
    documentModel: {
      ...module.documentModel,
      global: module.documentModel,
    },
  };
}

export function removeSynchronizationUnits(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(removeSynchronizationUnits);
  }

  if (typeof obj === "object") {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key !== "synchronizationUnits") {
        result[key] = removeSynchronizationUnits(value);
      }
    }
    return result;
  }

  return obj;
}

export function getDocumentModels(): DocumentModelModule[] {
  return [
    documentModelDocumentModelModule as unknown as DocumentModelModule,
    driveDocumentModelModule as unknown as DocumentModelModule,
    wrapAtlasModule(atlasModels.AtlasScope),
    wrapAtlasModule(atlasModels.AtlasFoundation),
    wrapAtlasModule(atlasModels.AtlasGrounding),
    wrapAtlasModule(atlasModels.AtlasExploratory),
    wrapAtlasModule(atlasModels.AtlasMultiParent),
    wrapAtlasModule(atlasModels.AtlasSet),
    wrapAtlasModule(atlasModels.AtlasFeedbackIssues),
  ];
}

export async function processReactorMutation(
  mutation: RecordedOperation,
  reactor: Reactor,
  driveIds?: string[],
): Promise<void> {
  const { name, args } = mutation;

  if (name === "createDrive") {
    const { id, name, slug } = args;
    if (driveIds) {
      driveIds.push(id);
    }

    const modules = await reactor.getDocumentModels();
    const driveModule = modules.results.find(
      (m: DocumentModelModule) =>
        m.documentModel.global.id === "powerhouse/document-drive",
    );
    if (!driveModule) {
      throw new Error("Drive document model not found");
    }

    const driveDoc = driveModule.utils.createDocument();
    driveDoc.header.id = id;
    driveDoc.header.name = name;
    driveDoc.header.slug = slug;
    driveDoc.state.global.name = name;
    driveDoc.state.global.icon = "";
    driveDoc.state.local.sharingType = "PUBLIC";
    driveDoc.state.local.availableOffline = false;
    driveDoc.state.local.listeners = [];
    driveDoc.state.local.triggers = [];

    const jobInfo = await reactor.create(driveDoc);
    await vi.waitUntil(async () => {
      const status = await reactor.getJobStatus(jobInfo.id);
      if (status.status === JobStatus.FAILED) {
        const errorMessage = status.error?.message ?? "unknown error";
        throw new Error(`createDrive failed: ${errorMessage}`);
      }
      return status.status === JobStatus.COMPLETED;
    });
  } else if (name === "addDriveAction") {
    const { driveId, driveAction } = args;

    if (driveAction.type === "ADD_FILE") {
      const docType = driveAction.input.documentType;
      const modules = await reactor.getDocumentModels();
      const module = modules.results.find(
        (m: DocumentModelModule) => m.documentModel.global.id === docType,
      );

      if (!module) {
        throw new Error(`Document model not found for type: ${docType}`);
      }

      const fileDoc = module.utils.createDocument();
      fileDoc.header.id = driveAction.input.id;
      fileDoc.header.name = driveAction.input.name;

      const createJobInfo = await reactor.create(fileDoc);
      await vi.waitUntil(async () => {
        const status = await reactor.getJobStatus(createJobInfo.id);
        if (status.status === JobStatus.FAILED) {
          const errorMessage = status.error?.message ?? "unknown error";
          throw new Error(`Failed to create child document: ${errorMessage}`);
        }
        return status.status === JobStatus.COMPLETED;
      });

      const fileAction = addFile({
        id: driveAction.input.id,
        name: driveAction.input.name,
        documentType: driveAction.input.documentType,
        parentFolder: driveAction.input.parentFolder || null,
      });

      const addRelationshipAction = {
        id: uuidv4(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        timestampUtcMs: new Date().toISOString(),
        input: {
          sourceId: driveId,
          targetId: driveAction.input.id,
          relationshipType: "child",
        },
      };

      const batchRequest: BatchMutationRequest = {
        jobs: [
          {
            key: "addFile",
            documentId: driveId,
            scope: "global",
            branch: "main",
            actions: [fileAction],
            dependsOn: [],
          },
          {
            key: "linkChild",
            documentId: driveId,
            scope: "document",
            branch: "main",
            actions: [addRelationshipAction],
            dependsOn: ["addFile"],
          },
        ],
      };

      const result = await reactor.mutateBatch(batchRequest);

      await vi.waitUntil(async () => {
        const addFileStatus = await reactor.getJobStatus(
          result.jobs.addFile.id,
        );
        const linkChildStatus = await reactor.getJobStatus(
          result.jobs.linkChild.id,
        );
        if (addFileStatus.status === JobStatus.FAILED) {
          const errorMessage = addFileStatus.error?.message ?? "unknown error";
          throw new Error(`ADD_FILE action failed: ${errorMessage}`);
        }
        if (linkChildStatus.status === JobStatus.FAILED) {
          const errorMessage =
            linkChildStatus.error?.message ?? "unknown error";
          throw new Error(
            `ADD_RELATIONSHIP action failed: ${errorMessage}`,
          );
        }
        return (
          addFileStatus.status === JobStatus.COMPLETED &&
          linkChildStatus.status === JobStatus.COMPLETED
        );
      });
    } else {
      const cleanedAction = removeSynchronizationUnits(driveAction) as Action;

      const jobInfo = await reactor.mutate(driveId, [cleanedAction]);
      await vi.waitUntil(async () => {
        const status = await reactor.getJobStatus(jobInfo.id);
        if (status.status === JobStatus.FAILED) {
          const errorMessage = status.error?.message ?? "unknown error";
          throw new Error(`addDriveAction failed: ${errorMessage}`);
        }
        return status.status === JobStatus.COMPLETED;
      });
    }
  } else if (name === "addAction") {
    const { docId, action } = args;
    const cleanedAction = removeSynchronizationUnits(action) as Action;

    const jobInfo = await reactor.mutate(docId, [cleanedAction]);
    await vi.waitUntil(async () => {
      const status = await reactor.getJobStatus(jobInfo.id);
      if (status.status === JobStatus.FAILED) {
        status.errorHistory?.forEach((error, index) => {
          console.error(`[Attempt ${index + 1}] ${error.message}`);
          console.error(`[Attempt ${index + 1}] Stack trace:\n${error.stack}`);
        });

        throw new Error(
          `addAction failed: ${status.error?.message ?? "unknown error"}: ${status.error?.stack ?? "unknown stack"}`,
        );
      }
      return status.status === JobStatus.COMPLETED;
    });
  }
}

export async function processBaseServerMutation(
  mutation: RecordedOperation,
  driveServer: BaseDocumentDriveServer,
): Promise<void> {
  const { name, args } = mutation;

  if (name === "createDrive") {
    const { id, name, slug } = args;
    await driveServer.addDrive({
      id,
      slug,
      global: {
        name,
        icon: "",
      },
      local: {
        availableOffline: false,
        sharingType: "PUBLIC",
        listeners: [],
        triggers: [],
      },
    });
  } else if (name === "addDriveAction") {
    const { driveId, driveAction } = args;

    if (driveAction.type === "ADD_FILE") {
      const docType = driveAction.input.documentType;
      const modules = driveServer.getDocumentModelModules();
      const module = modules.find(
        (m: DocumentModelModule) => m.documentModel.global.id === docType,
      );

      if (!module) {
        throw new Error(`Document model not found for type: ${docType}`);
      }

      const fileDoc = module.utils.createDocument();
      fileDoc.header.id = driveAction.input.id;
      fileDoc.header.name = driveAction.input.name;

      await driveServer.addDocument(fileDoc);

      const fileAction = addFile({
        id: driveAction.input.id,
        name: driveAction.input.name,
        documentType: driveAction.input.documentType,
        parentFolder: driveAction.input.parentFolder || null,
      });

      const addFileResult = await driveServer.addDriveAction(
        driveId,
        fileAction,
      );

      if (addFileResult.status !== "SUCCESS") {
        throw new Error(
          `ADD_FILE action failed: ${addFileResult.error?.message ?? "unknown error"}`,
        );
      }

      const addRelationshipAction = {
        id: uuidv4(),
        type: "ADD_RELATIONSHIP",
        scope: "document",
        timestampUtcMs: new Date().toISOString(),
        input: {
          sourceId: driveId,
          targetId: driveAction.input.id,
          relationshipType: "child",
        },
      };

      const relationshipResult = await driveServer.addDriveAction(
        driveId,
        addRelationshipAction as any,
      );

      if (relationshipResult.status !== "SUCCESS") {
        throw new Error(
          `ADD_RELATIONSHIP action failed: ${relationshipResult.error?.message ?? "unknown error"}`,
        );
      }
    } else {
      const cleanedAction = removeSynchronizationUnits(driveAction) as Action;

      const result = await driveServer.addDriveAction(driveId, cleanedAction);

      if (result.status !== "SUCCESS") {
        throw new Error(
          `addDriveAction failed: ${result.error?.message ?? "unknown error"}`,
        );
      }
    }
  } else if (name === "addAction") {
    const { docId, action } = args;
    const cleanedAction = removeSynchronizationUnits(action) as Action;

    const result = await driveServer.addAction(docId, cleanedAction);

    if (result.status !== "SUCCESS") {
      throw new Error(
        `addAction failed: ${result.error?.message ?? "unknown error"}`,
      );
    }
  }
}
