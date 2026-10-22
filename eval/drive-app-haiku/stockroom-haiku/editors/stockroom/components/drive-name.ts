import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";

/** Drives created in Connect keep their name in state.global; drives created over MCP keep it in header.name. */
export function driveName(drive: DocumentDriveDocument): string {
  return drive.state.global.name || drive.header.name;
}
