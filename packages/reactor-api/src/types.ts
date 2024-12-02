import { IDocumentDriveServer } from "document-drive";
import { IncomingHttpHeaders } from "http";

export interface Context {
  headers: IncomingHttpHeaders;
  driveId: string | undefined;
  driveServer: IDocumentDriveServer;
}
