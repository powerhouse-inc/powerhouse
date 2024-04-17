import type { Document } from "document-model/document";

export interface ICache {
    setDocument(drive: string, id: string, document: Document): Promise<boolean>
    getDocument(drive: string, id: string): Promise<Document | undefined>

    // @returns — true if a document existed and has been removed, or false if the document is not cached.
    deleteDocument(drive: string, id: string): Promise<boolean>
}
