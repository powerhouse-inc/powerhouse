import { DocumentDriveDocument } from "document-drive";
import { OperationScope, PHDocument } from "document-model";

export function documentToHash(drive: PHDocument): string {
  return Object.keys(drive.operations)
    .map(
      (key) =>
        `${key}:${drive.operations[key as OperationScope].length}:${drive.operations[key as OperationScope].at(-1)?.hash}`,
    )
    .join(":");
}

export function drivesToHash(drives: DocumentDriveDocument[]): string {
  return drives.map(documentToHash).join("&");
}
