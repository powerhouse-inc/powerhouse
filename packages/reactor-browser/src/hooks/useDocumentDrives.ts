import { type DocumentDriveDocument } from "document-drive";

import { documentToHash } from "../utils/index.js";
export { documentToHash };

export function drivesToHash(drives: DocumentDriveDocument[]): string {
  return drives.map(documentToHash).join("&");
}
