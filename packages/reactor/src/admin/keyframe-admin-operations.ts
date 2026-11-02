const TOTALS = `streams rows bytes removableRows removableBytes removedRows removedBytes`;

const CLEANUP_RUN = `
  id
  dryRun
  state
  startedAtUtcMs
  finishedAtUtcMs
  documentsTotal
  documentsSeen
  parked
  totals { ${TOTALS} }
  types { documentType keep interval ${TOTALS} }
  reasons { reason rows bytes }
  topStreams {
    documentId
    documentType
    scope
    branch
    reason
    rows
    bytes
    removableRows
    removableBytes
  }
  error
`;

const RECLAIM = `
  state
  startedAtUtcMs
  finishedAtUtcMs
  tableBytesBefore
  tableBytesAfter
  durationMs
  message
`;

/**
 * The keyframe operations of a host's `inspection-admin` subgraph, shared by
 * the monitor and the CLI.
 */
export const KEYFRAME_ADMIN_OPERATIONS = {
  access: `query ReactorInspectionKeyframeAccess {
    inspectionAdmin { keyframes }
  }`,
  cleanup: `query ReactorInspectionKeyframeCleanup {
    inspectionKeyframeCleanup { ${CLEANUP_RUN} }
  }`,
  reclaimStatus: `query ReactorInspectionKeyframeReclaim {
    inspectionKeyframeReclaim { ${RECLAIM} }
  }`,
  startCleanup: `mutation ReactorInspectionStartKeyframeCleanup($dryRun: Boolean!) {
    inspectionStartKeyframeCleanup(dryRun: $dryRun) { ${CLEANUP_RUN} }
  }`,
  cancelCleanup: `mutation ReactorInspectionCancelKeyframeCleanup {
    inspectionCancelKeyframeCleanup
  }`,
  reclaim: `mutation ReactorInspectionReclaimKeyframeSpace {
    inspectionReclaimKeyframeSpace { ${RECLAIM} }
  }`,
} as const;
