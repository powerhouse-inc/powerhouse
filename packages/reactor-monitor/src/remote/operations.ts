import { INSPECTION_WIRE_FIELDS } from "@powerhousedao/reactor";

// Selections come from INSPECTION_WIRE_FIELDS, which reactor-api pins its SDL to.

type WireType = keyof typeof INSPECTION_WIRE_FIELDS;

// The object-typed fields of each wire record, and the record each one holds.
const NESTED: Partial<
  Record<WireType, Readonly<Partial<Record<string, WireType>>>>
> = {
  ReactorInfo: { storage: "ReactorStorageFacts", access: "InspectorAccess" },
  InspectionDrivePage: { results: "InspectionDrive" },
  InspectionDriveIntegrity: {
    missingDocuments: "InspectionDriveIntegrityRef",
    unsupportedTypes: "InspectionDriveIntegrityRef",
  },
  InspectionQueueState: {
    pendingJobs: "InspectionQueueJob",
    executingJobs: "InspectionQueueJob",
  },
  InspectionRemote: {
    inboxCursor: "InspectionCursor",
    outboxCursor: "InspectionCursor",
    mailboxDepths: "InspectionMailboxDepths",
    connection: "InspectionConnectionHealth",
  },
  InspectionDeadLetterPage: { results: "InspectionDeadLetter" },
  InspectionCatchUpPriority: {
    settings: "InspectionCatchUpLevelSettings",
    sample: "InspectionCatchUpLoadSample",
  },
};

/** `{ ... }` selecting every field of `type`, nested records included. */
export function selectionOf(type: WireType): string {
  const nested = NESTED[type] ?? {};
  const fields = INSPECTION_WIRE_FIELDS[type].map((field: string) => {
    const child = nested[field];
    return child ? `${field} ${selectionOf(child)}` : field;
  });
  return `{ ${fields.join(" ")} }`;
}

export const INSPECTION_OPERATIONS = {
  info: `query ReactorInspectionInfo {
    inspection { info ${selectionOf("ReactorInfo")} }
  }`,

  documentModels: `query ReactorInspectionDocumentModels {
    inspection { documentModels ${selectionOf("InspectionDocumentModel")} }
  }`,

  loadsModelsOnDemand: `query ReactorInspectionModelLoading {
    inspection { loadsModelsOnDemand }
  }`,

  drives: `query ReactorInspectionDrives($cursor: String, $limit: Int) {
    inspection {
      drives(cursor: $cursor, limit: $limit) ${selectionOf("InspectionDrivePage")}
    }
  }`,

  driveIntegrity: `query ReactorInspectionDriveIntegrity(
    $driveId: String!
    $branch: String!
  ) {
    inspection {
      driveIntegrity(driveId: $driveId, branch: $branch) ${selectionOf("InspectionDriveIntegrity")}
    }
  }`,

  attachmentInfo: `query ReactorInspectionAttachmentInfo {
    inspection { attachmentInfo ${selectionOf("InspectionAttachmentInfo")} }
  }`,

  queueState: `query ReactorInspectionQueueState {
    inspection { queueState ${selectionOf("InspectionQueueState")} }
  }`,

  processors: `query ReactorInspectionProcessors {
    inspection { processors ${selectionOf("InspectionProcessor")} }
  }`,

  catchUpStatus: `query ReactorInspectionCatchUp { inspection { catchUpStatus } }`,

  catchUpPriority: `query ReactorInspectionCatchUpPriority {
    inspection { catchUpPriority ${selectionOf("InspectionCatchUpPriority")} }
  }`,

  storageHealth: `query ReactorInspectionStorageHealth {
    inspection { storageHealth ${selectionOf("InspectionStorageHealth")} }
  }`,

  validateDocument: `query ReactorInspectionValidateDocument(
    $documentId: String!
    $branch: String
  ) {
    inspection {
      validateDocument(documentId: $documentId, branch: $branch) ${selectionOf("InspectionValidation")}
    }
  }`,

  remotes: `query ReactorInspectionRemotes {
    inspection { remotes ${selectionOf("InspectionRemote")} }
  }`,

  remote: `query ReactorInspectionRemote($remoteName: String!) {
    inspection { remote(remoteName: $remoteName) ${selectionOf("InspectionRemote")} }
  }`,

  deadLetters: `query ReactorInspectionDeadLetters(
    $remoteName: String!
    $cursor: String
    $limit: Int
  ) {
    inspection {
      deadLetters(remoteName: $remoteName, cursor: $cursor, limit: $limit) ${selectionOf("InspectionDeadLetterPage")}
    }
  }`,
} as const;

export type InspectionOperationName = keyof typeof INSPECTION_OPERATIONS;
