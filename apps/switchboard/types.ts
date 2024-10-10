import { BaseDocumentDriveServer } from 'document-drive';
import { DrizzleD1Database } from 'drizzle-orm/d1';
import { IncomingHttpHeaders } from 'http';

export type Context = {
    driveServer: BaseDocumentDriveServer;
    driveId?: string;
    headers: IncomingHttpHeaders;
    db: Omit<DrizzleD1Database, 'run' | 'batch' | 'all' | 'get' | 'values'>;
};
