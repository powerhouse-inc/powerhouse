/**
 * The GraphQL documents the remote inspector sends, written by hand against
 * reactor-api's inspection subgraph (`packages/reactor-api/src/graphql/
 * inspection/schema.ts`, multi-reactor W3.2).
 *
 * Hand-written rather than generated, and kept in one file, for the same
 * reason `reactor-browser`'s sync documents are: this package must not depend
 * on the server package. The server test
 * (`packages/reactor-api/test/inspection-subgraph.test.ts`) pins the schema's
 * root field names so a rename there shows up as a diff next to these
 * documents rather than as a runtime failure on the far side of HTTP.
 */

/** Selection set of `ReactorInspectionInfo`; the reported capability facts. */
const INFO_FIELDS = `
  hosting
  inspection
  storageKind
  processors
  workflows
  syncChannels
  adminEnabled
  sqlEnabled
`;

/** Selection set of `InspectionRemote`: one remote's cursors, depths, health and config. */
const REMOTE_FIELDS = `
  remoteName
  remoteId
  meta
  inboxCursor {
    cursorType
    cursorOrdinal
    lastSyncedAtUtcMs
    liveAckOrdinal
    liveLatestOrdinal
  }
  outboxCursor {
    cursorType
    cursorOrdinal
    lastSyncedAtUtcMs
    liveAckOrdinal
    liveLatestOrdinal
  }
  mailboxDepths {
    inbox
    outbox
    deadLetter
  }
  connection {
    snapshot
    neverSucceeded
    stalenessMs
  }
`;

export const INSPECTION_OPERATIONS = {
  info: `query ReactorInspectionInfo { inspection { info { ${INFO_FIELDS} } } }`,

  queueState: `query ReactorInspectionQueueState {
    inspection {
      queueState {
        isPaused
        totalPending
        totalExecuting
        pendingJobs
        executingJobs
      }
    }
  }`,

  processors: `query ReactorInspectionProcessors {
    inspection {
      processors {
        processorId
        factoryId
        driveId
        processorIndex
        lastOrdinal
        status
        lastError
        lastErrorTimestampUtcMs
      }
    }
  }`,

  catchUpStatus: `query ReactorInspectionCatchUp { inspection { catchUpStatus } }`,

  storageHealth: `query ReactorInspectionStorageHealth {
    inspection {
      storageHealth {
        healthy
        everRecreated
        recreateCount
        lastRecreated
      }
    }
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
        remoteName
        results
        nextCursor
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

  rewindInboxCursor: `mutation ReactorInspectionRewindInboxCursor($remoteName: String!, $toOrdinal: Int!) {
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
