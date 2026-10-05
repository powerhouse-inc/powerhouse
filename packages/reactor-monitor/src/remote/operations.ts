import { INSPECTION_WIRE_FIELDS } from "@powerhousedao/reactor";

/**
 * The GraphQL documents the remote inspector sends, against reactor-api's
 * inspection subgraph (`packages/reactor-api/src/graphql/inspection/schema.ts`,
 * multi-reactor W3.2).
 *
 * Hand-written rather than codegen'd, and kept in one file, for the same reason
 * `reactor-browser`'s sync documents are: this package must not depend on the
 * server package. What the two ends DO share is the wire contract itself --
 * `INSPECTION_WIRE_FIELDS` in `@powerhousedao/reactor` -- so every selection
 * set below is built from the same field table reactor-api's test pins its SDL
 * against. A field added to the contract and not to the schema fails there; a
 * field this client asks for that the contract does not have cannot be written
 * here at all.
 */

const fields = (type: keyof typeof INSPECTION_WIRE_FIELDS): string =>
  INSPECTION_WIRE_FIELDS[type].join("\n  ");

/** Selection set of `ReactorInspectionInfo`; the reported capability facts. */
const INFO_FIELDS = fields("ReactorInspectionInfo");

const CURSOR_FIELDS = fields("InspectionCursor");

/** Selection set of `InspectionRemote`: one remote's cursors, depths, health and config. */
const REMOTE_FIELDS = `
  remoteName
  remoteId
  meta
  inboxCursor { ${CURSOR_FIELDS} }
  outboxCursor { ${CURSOR_FIELDS} }
  mailboxDepths { ${fields("InspectionMailboxDepths")} }
  connection { ${fields("InspectionConnectionHealth")} }
`;

export const INSPECTION_OPERATIONS = {
  info: `query ReactorInspectionInfo { inspection { info { ${INFO_FIELDS} } } }`,

  documentModels: `query ReactorInspectionDocumentModels {
    inspection { documentModels { ${fields("InspectionDocumentModel")} } }
  }`,

  drives: `query ReactorInspectionDrives($cursor: String, $limit: Int) {
    inspection {
      drives(cursor: $cursor, limit: $limit) {
        results { ${fields("InspectionDrive")} }
        nextCursor
      }
    }
  }`,

  driveIntegrity: `query ReactorInspectionDriveIntegrity(
    $driveId: String!
    $cursor: String
    $limit: Int
  ) {
    inspection {
      driveIntegrity(driveId: $driveId, cursor: $cursor, limit: $limit) {
        driveId
        checkedNodeCount
        totalFileNodeCount
        missingDocuments { ${fields("InspectionDriveIntegrityRef")} }
        unsupportedTypes { ${fields("InspectionDriveIntegrityRef")} }
        nextCursor
      }
    }
  }`,

  attachmentInfo: `query ReactorInspectionAttachmentInfo {
    inspection { attachmentInfo { ${fields("InspectionAttachmentInfo")} } }
  }`,

  queueState: `query ReactorInspectionQueueState {
    inspection { queueState { ${fields("InspectionQueueState")} } }
  }`,

  processors: `query ReactorInspectionProcessors {
    inspection { processors { ${fields("InspectionProcessor")} } }
  }`,

  catchUpStatus: `query ReactorInspectionCatchUp { inspection { catchUpStatus } }`,

  storageHealth: `query ReactorInspectionStorageHealth {
    inspection { storageHealth { ${fields("InspectionStorageHealth")} } }
  }`,

  remotes: `query ReactorInspectionRemotes { inspection { remotes { ${REMOTE_FIELDS} } } }`,

  remote: `query ReactorInspectionRemote($remoteName: String!) {
    inspection { remote(remoteName: $remoteName) { ${REMOTE_FIELDS} } }
  }`,

  deadLetters: `query ReactorInspectionDeadLetters(
    $remoteName: String!
    $cursor: String
    $limit: Int
  ) {
    inspection {
      deadLetters(remoteName: $remoteName, cursor: $cursor, limit: $limit) {
        ${fields("InspectionDeadLetterPage")}
      }
    }
  }`,

  holds: `query ReactorInspectionHolds($remoteName: String, $documentId: String) {
    inspection { holds(remoteName: $remoteName, documentId: $documentId) }
  }`,

  pauseQueue: `mutation ReactorInspectionPauseQueue { inspectionPauseQueue }`,

  resumeQueue: `mutation ReactorInspectionResumeQueue { inspectionResumeQueue }`,

  retryProcessor: `mutation ReactorInspectionRetryProcessor($processorId: String!) {
    inspectionRetryProcessor(processorId: $processorId)
  }`,

  sweepCatchUp: `mutation ReactorInspectionSweepCatchUp { inspectionSweepCatchUp }`,

  validateDocument: `mutation ReactorInspectionValidateDocument($documentId: String!, $branch: String) {
    inspectionValidateDocument(documentId: $documentId, branch: $branch)
  }`,

  rebuildKeyframes: `mutation ReactorInspectionRebuildKeyframes($documentId: String!, $branch: String) {
    inspectionRebuildKeyframes(documentId: $documentId, branch: $branch)
  }`,

  rebuildSnapshots: `mutation ReactorInspectionRebuildSnapshots($documentId: String!, $branch: String) {
    inspectionRebuildSnapshots(documentId: $documentId, branch: $branch)
  }`,

  triggerPull: `mutation ReactorInspectionTriggerPull($remoteName: String!) {
    inspectionTriggerPull(remoteName: $remoteName)
  }`,

  // `Float`, not `Int`: ordinals are bigint-origin and a long-lived reactor's
  // operation index passes 2^31, which `Int` refuses to carry.
  rewindInboxCursor: `mutation ReactorInspectionRewindInboxCursor($remoteName: String!, $toOrdinal: Float!) {
    inspectionRewindInboxCursor(remoteName: $remoteName, toOrdinal: $toOrdinal)
  }`,

  resetChannel: `mutation ReactorInspectionResetChannel($remoteName: String!) {
    inspectionResetChannel(remoteName: $remoteName)
  }`,

  requeueDeadLetter: `mutation ReactorInspectionRequeueDeadLetter($remoteName: String!, $id: String!) {
    inspectionRequeueDeadLetter(remoteName: $remoteName, id: $id)
  }`,

  clearDeadLetter: `mutation ReactorInspectionClearDeadLetter($remoteName: String!, $id: String!) {
    inspectionClearDeadLetter(remoteName: $remoteName, id: $id)
  }`,

  queryDb: `mutation ReactorInspectionQueryDb($sql: String!, $params: [Unknown!]) {
    inspectionQueryDb(sql: $sql, params: $params)
  }`,
} as const;

export type InspectionOperationName = keyof typeof INSPECTION_OPERATIONS;
