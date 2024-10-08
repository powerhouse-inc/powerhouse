import { BaseDocumentDriveServer } from "document-drive"

export type Context = {
    driveServer: BaseDocumentDriveServer
    driveId?: string
    user?: string
}