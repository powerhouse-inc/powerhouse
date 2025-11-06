import type {
  BaseDocumentDriveServer,
  DocumentDriveDocument,
} from "document-drive";
import { addFile, driveDocumentModelModule } from "document-drive";
import type {
  Action,
  CreateDocumentActionInput,
  DocumentModelModule,
  UpgradeDocumentActionInput,
} from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import type {
  BatchMutationRequest,
  IReactor,
} from "../../../src/core/types.js";
import { JobStatus } from "../../../src/shared/types.js";

import * as atlasModels from "@sky-ph/atlas/document-models";
import { v4 as uuidv4 } from "uuid";

async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const { timeout = 30000, interval = 100 } = options;
  const startTime = Date.now();

  for (;;) {
    const result = await condition();
    if (result) {
      return;
    }

    if (Date.now() - startTime > timeout) {
      throw new Error("waitUntil timeout exceeded");
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

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
  reactor: IReactor,
): Promise<void> {
  const { name, args } = mutation;

  if (name === "createDrive") {
    const { id, name, slug } = args;
    const modules = await reactor.getDocumentModels();
    const driveModule = modules.results.find(
      (m: DocumentModelModule) =>
        m.documentModel.global.id === "powerhouse/document-drive",
    );
    if (!driveModule) {
      throw new Error("Drive document model not found");
    }

    const driveDoc =
      driveModule.utils.createDocument() as DocumentDriveDocument;
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
    await waitUntil(async () => {
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
      await waitUntil(async () => {
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

      await waitUntil(async () => {
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
          throw new Error(`ADD_RELATIONSHIP action failed: ${errorMessage}`);
        }
        return (
          addFileStatus.status === JobStatus.COMPLETED &&
          linkChildStatus.status === JobStatus.COMPLETED
        );
      });
    } else {
      const cleanedAction = removeSynchronizationUnits(driveAction) as Action;

      const jobInfo = await reactor.mutate(driveId, [cleanedAction]);
      await waitUntil(async () => {
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
    await waitUntil(async () => {
      const status = await reactor.getJobStatus(jobInfo.id);
      if (status.status === JobStatus.FAILED) {
        throw new Error(
          `addAction failed: ${status.error?.message ?? "unknown error"}: ${status.error?.stack ?? "unknown stack"}`,
        );
      }
      return status.status === JobStatus.COMPLETED;
    });
  }
}

export function buildBatchMutationRequest(
  modules: DocumentModelModule[],
  mutations: RecordedOperation[],
): BatchMutationRequest {
  const jobs: Array<{
    key: string;
    documentId: string;
    scope: string;
    branch: string;
    actions: Action[];
    dependsOn: string[];
  }> = [];

  const documentCreationKeys: Map<string, string> = new Map();
  let jobCounter = 0;

  for (const mutation of mutations) {
    const { name, args } = mutation;

    if (name === "createDrive") {
      const { id, name, slug } = args;

      const driveModule = modules.find(
        (m: DocumentModelModule) =>
          m.documentModel.global.id === "powerhouse/document-drive",
      );
      if (!driveModule) {
        throw new Error("Drive document model not found");
      }

      const driveDoc =
        driveModule.utils.createDocument() as DocumentDriveDocument;
      driveDoc.header.id = id;
      driveDoc.header.name = name;
      driveDoc.header.slug = slug;
      driveDoc.state.global.name = name;
      driveDoc.state.global.icon = "";
      driveDoc.state.local.sharingType = "PUBLIC";
      driveDoc.state.local.availableOffline = false;
      driveDoc.state.local.listeners = [];
      driveDoc.state.local.triggers = [];

      const createInput: CreateDocumentActionInput = {
        model: driveDoc.header.documentType,
        version: "0.0.0",
        documentId: driveDoc.header.id,
        signing: {
          signature: driveDoc.header.id,
          publicKey: driveDoc.header.sig.publicKey,
          nonce: driveDoc.header.sig.nonce,
          createdAtUtcIso: driveDoc.header.createdAtUtcIso,
          documentType: driveDoc.header.documentType,
        },
        slug: driveDoc.header.slug,
        name: driveDoc.header.name,
        branch: driveDoc.header.branch,
        meta: driveDoc.header.meta,
      };

      const createAction: Action = {
        id: `${driveDoc.header.id}-create`,
        type: "CREATE_DOCUMENT",
        scope: "document",
        timestampUtcMs: new Date().toISOString(),
        input: createInput,
      };

      const upgradeInput: UpgradeDocumentActionInput = {
        model: driveDoc.header.documentType,
        fromVersion: "0.0.0",
        toVersion: "0.0.0",
        documentId: driveDoc.header.id,
        initialState: driveDoc.state,
      };

      const upgradeAction: Action = {
        id: `${driveDoc.header.id}-upgrade`,
        type: "UPGRADE_DOCUMENT",
        scope: "document",
        timestampUtcMs: new Date().toISOString(),
        input: upgradeInput,
      };

      const createKey = `create-drive-${id}-${jobCounter++}`;
      documentCreationKeys.set(id, createKey);

      jobs.push({
        key: createKey,
        documentId: id,
        scope: "document",
        branch: "main",
        actions: [createAction, upgradeAction],
        dependsOn: [],
      });
    } else if (name === "addDriveAction") {
      const { driveId, driveAction } = args;

      if (driveAction.type === "ADD_FILE") {
        const docType = driveAction.input.documentType;
        const module = modules.find(
          (m: DocumentModelModule) => m.documentModel.global.id === docType,
        );

        if (!module) {
          throw new Error(`Document model not found for type: ${docType}`);
        }

        const fileDoc = module.utils.createDocument();
        fileDoc.header.id = driveAction.input.id;
        fileDoc.header.name = driveAction.input.name;

        const createFileInput: CreateDocumentActionInput = {
          model: fileDoc.header.documentType,
          version: "0.0.0",
          documentId: fileDoc.header.id,
          signing: {
            signature: fileDoc.header.id,
            publicKey: fileDoc.header.sig.publicKey,
            nonce: fileDoc.header.sig.nonce,
            createdAtUtcIso: fileDoc.header.createdAtUtcIso,
            documentType: fileDoc.header.documentType,
          },
          slug: fileDoc.header.slug,
          name: fileDoc.header.name,
          branch: fileDoc.header.branch,
          meta: fileDoc.header.meta,
        };

        const createFileAction: Action = {
          id: `${fileDoc.header.id}-create`,
          type: "CREATE_DOCUMENT",
          scope: "document",
          timestampUtcMs: new Date().toISOString(),
          input: createFileInput,
        };

        const upgradeFileInput: UpgradeDocumentActionInput = {
          model: fileDoc.header.documentType,
          fromVersion: "0.0.0",
          toVersion: "0.0.0",
          documentId: fileDoc.header.id,
          initialState: fileDoc.state,
        };

        const upgradeFileAction: Action = {
          id: `${fileDoc.header.id}-upgrade`,
          type: "UPGRADE_DOCUMENT",
          scope: "document",
          timestampUtcMs: new Date().toISOString(),
          input: upgradeFileInput,
        };

        const createFileKey = `create-file-${driveAction.input.id}-${jobCounter++}`;
        documentCreationKeys.set(driveAction.input.id, createFileKey);

        const driveCreationKey = documentCreationKeys.get(driveId);
        const createFileDeps = driveCreationKey ? [driveCreationKey] : [];

        jobs.push({
          key: createFileKey,
          documentId: driveAction.input.id,
          scope: "document",
          branch: "main",
          actions: [createFileAction, upgradeFileAction],
          dependsOn: createFileDeps,
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

        const addFileKey = `add-file-${driveAction.input.id}-${jobCounter++}`;
        jobs.push({
          key: addFileKey,
          documentId: driveId,
          scope: "global",
          branch: "main",
          actions: [fileAction],
          dependsOn: [createFileKey],
        });

        const linkChildKey = `link-child-${driveAction.input.id}-${jobCounter++}`;
        jobs.push({
          key: linkChildKey,
          documentId: driveId,
          scope: "document",
          branch: "main",
          actions: [addRelationshipAction],
          dependsOn: [addFileKey],
        });
      } else {
        const cleanedAction = removeSynchronizationUnits(driveAction) as Action;
        const driveCreationKey = documentCreationKeys.get(driveId);
        const deps = driveCreationKey ? [driveCreationKey] : [];

        const actionKey = `drive-action-${driveId}-${jobCounter++}`;
        jobs.push({
          key: actionKey,
          documentId: driveId,
          scope: "global",
          branch: "main",
          actions: [cleanedAction],
          dependsOn: deps,
        });
      }
    } else if (name === "addAction") {
      const { docId, action } = args;
      const cleanedAction = removeSynchronizationUnits(action) as Action;
      const docCreationKey = documentCreationKeys.get(docId);
      const deps = docCreationKey ? [docCreationKey] : [];

      const actionKey = `action-${docId}-${jobCounter++}`;
      jobs.push({
        key: actionKey,
        documentId: docId,
        scope: "global",
        branch: "main",
        actions: [cleanedAction],
        dependsOn: deps,
      });
    }
  }

  const batchRequest: BatchMutationRequest = { jobs };
  return batchRequest;
}

export async function submitAllMutationsWithQueueHints(
  mutations: RecordedOperation[],
  reactor: IReactor,
): Promise<{ jobs: Record<string, { id: string; status: JobStatus }> }> {
  const documentModels = await reactor.getDocumentModels();
  const batchRequest = buildBatchMutationRequest(
    documentModels.results,
    mutations,
  );

  return await reactor.mutateBatch(batchRequest);
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
