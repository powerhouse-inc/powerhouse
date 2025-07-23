import { type IDocumentDriveServer } from "document-drive";

declare global {
  interface Window {
    reactor?: IDocumentDriveServer | undefined;
  }
}
