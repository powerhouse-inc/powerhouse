/**
 * @powerhousedao/host-core — the uniform-runners host framework.
 *
 * Phase 1 (in progress): the host.js loader and runner resolver move here
 * from ph-cli, followed by the generic compound runner (supervision,
 * instance-fact projection, run records, locks). Plan of record:
 * docs/plans/2026-10-13-uniform-runners.md.
 */

export {
  mergeDefaultDrives,
  projectDrivesIntoConnect,
  rebaseDriveUrl,
  type DriveProjectionInput,
} from "./connect-projection.js";
