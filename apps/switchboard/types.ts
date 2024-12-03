import { BaseDocumentDriveServer } from "document-drive";
import { PgDatabase } from "drizzle-orm/pg-core";
import { IncomingHttpHeaders } from "http";
export type Context = {
  driveServer: BaseDocumentDriveServer;
  driveId?: string;
  headers: IncomingHttpHeaders;
  db: PgDatabase<any, any, any>;
};
