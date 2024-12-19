import { Document, OperationScope } from "document-model/document";
import { DocumentDriveDocument } from "document-model-libs/document-drive";

export function documentToHash(drive: Document): string {
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
