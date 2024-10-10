import { BaseDocumentDriveServer } from "document-drive"
import { DrizzleD1Database } from "drizzle-orm/d1"

export type Context = {
    driveServer: BaseDocumentDriveServer
    driveId?: string
    user?: string
    db: DrizzleD1Database
}