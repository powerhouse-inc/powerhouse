import { IncomingHttpHeaders } from "node:http";
import { BaseDocumentDriveServer } from "document-drive";

export type Context = {
  driveServer: BaseDocumentDriveServer;
  driveId?: string;
  headers: IncomingHttpHeaders;
  db: unknown;
};
