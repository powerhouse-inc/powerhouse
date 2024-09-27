import { Document } from 'document-model/document';
import { ICache } from './types';

class InMemoryCache implements ICache {
    private cache = new Map<string, Map<string, Document>>();

    async setDocument(drive: string, id: string, document: Document) {
        const global = document.operations.global.map(e => {
            delete e.resultingState;
            return e;
        });
        const local = document.operations.local.map(e => {
            delete e.resultingState;
            return e;
        });
        const doc = { ...document, operations: { global, local } };
        if (!this.cache.has(drive)) {
            this.cache.set(drive, new Map());
        }
        this.cache.get(drive)?.set(id, doc);
        return true;
    }

    async deleteDocument(drive: string, id: string) {
        return this.cache.get(drive)?.delete(id) ?? false;
    }

    async getDocument(drive: string, id: string) {
        return this.cache.get(drive)?.get(id);
    }
}

export default InMemoryCache;
