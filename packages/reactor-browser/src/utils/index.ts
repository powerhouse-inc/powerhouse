import { type DocumentDriveDocument } from "document-drive";
import { type PHDocument } from "document-model";

export function documentToHash(drive: PHDocument): string {
  return Object.keys(drive.operations)
    .map(
      (key) =>
        `${key}:${drive.operations[key].length}:${drive.operations[key].at(-1)?.hash}`,
    )
    .join(":");
}

export function drivesToHash(drives: DocumentDriveDocument[]): string {
  return drives.map(documentToHash).join("&");
}
