import type { IncomingHttpHeaders } from "http";
import { IDocumentDriveServer } from "document-drive";

export type Context = {
  driveServer: IDocumentDriveServer;
  driveId?: string;
  headers: IncomingHttpHeaders;
  db: unknown;
};
