import * as DocumentDrive from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { DocumentModel } from 'document-model/document';
import {
    DocumentModelDocument,
    module as DocumentModelLib
} from 'document-model/document-model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentDriveServer } from '../src';
import InMemoryCache from '../src/cache/memory';
import { MemoryStorage } from '../src/storage/memory';
import { buildOperation, expectUUID } from './utils';

describe('Document operations', () => {
    const documentModels = [
        DocumentModelLib,
        ...Object.values(DocumentModelsLibs)
    ] as DocumentModel[];

    beforeEach(async () => {
        vi.useFakeTimers().setSystemTime(new Date('2024-01-01'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    async function buildFile() {
        await server.addDrive({
            global: { id: '1', name: 'test', icon: null, slug: null },
            local: {
                availableOffline: false,
                sharingType: 'PRIVATE',
                listeners: [],
                triggers: []
            }
        });
        const drive = await server.getDrive('1');
        await server.addDriveOperation(
            '1',
            buildOperation(
                DocumentDrive.reducer,
                drive,
                DocumentDrive.utils.generateAddNodeAction(
                    drive.state.global,
                    {
                        id: '1',
                        name: 'test',
                        documentType: 'powerhouse/document-model'
                    },
                    ['global', 'local']
                )
            )
        );

        return server.getDocument('1', '1') as Promise<DocumentModelDocument>;
    }

    it('should return drive synchronizationUnit', async () => {
        const storage = new MemoryStorage();
        const cache = new InMemoryCache();
        const server = new DocumentDriveServer(documentModels, storage, cache);
        await server.initialize();

        await server.addDrive({
            global: { id: '1', name: 'test', icon: null, slug: null },
            local: {
                availableOffline: false,
                sharingType: 'PRIVATE',
                listeners: [],
                triggers: []
            }
        });

        const storageSpy = vi.spyOn(storage, 'getDrive');
        const cacheSpy = vi.spyOn(cache, 'getDocument');
        const syncUnits = await server.getSynchronizationUnits('1');
        expect(syncUnits).toStrictEqual([
            {
                syncId: '0',
                branch: 'main',
                documentId: '',
                documentType: 'powerhouse/document-drive',
                driveId: '1',
                lastUpdated: '2024-01-01T00:00:00.000Z',
                revision: 0,
                scope: 'global'
            }
        ]);
        expect(storageSpy).toHaveBeenCalledTimes(0);
        expect(cacheSpy).toHaveBeenCalledTimes(1);
    });

    it('should return all synchronizationUnits', async () => {
        const storage = new MemoryStorage();
        const cache = new InMemoryCache();
        const server = new DocumentDriveServer(documentModels, storage, cache);
        await server.initialize();

        await server.addDrive({
            global: { id: '1', name: 'test', icon: null, slug: null },
            local: {
                availableOffline: false,
                sharingType: 'PRIVATE',
                listeners: [],
                triggers: []
            }
        });
        const drive = await server.getDrive('1');
        await server.addDriveOperation(
            '1',
            buildOperation(
                DocumentDrive.reducer,
                drive,
                DocumentDrive.utils.generateAddNodeAction(
                    drive.state.global,
                    {
                        id: '1',
                        name: 'test',
                        documentType: 'powerhouse/document-model'
                    },
                    ['global', 'local']
                )
            )
        );

        const storageSpy = vi.spyOn(storage, 'getDrive');
        const cacheSpy = vi.spyOn(cache, 'getDocument');
        const syncUnits = await server.getSynchronizationUnits('1');
        expect(syncUnits).toStrictEqual([
            {
                syncId: '0',
                branch: 'main',
                documentId: '',
                documentType: 'powerhouse/document-drive',
                driveId: '1',
                lastUpdated: '2024-01-01T00:00:00.000Z',
                revision: 0,
                scope: 'global'
            },
            {
                syncId: expectUUID(expect),
                branch: 'main',
                documentId: '1',
                documentType: 'powerhouse/document-model',
                driveId: '1',
                lastUpdated: '2024-01-01T00:00:00.000Z',
                revision: 0,
                scope: 'global'
            },
            {
                syncId: expectUUID(expect),
                branch: 'main',
                documentId: '1',
                documentType: 'powerhouse/document-model',
                driveId: '1',
                lastUpdated: '2024-01-01T00:00:00.000Z',
                revision: 0,
                scope: 'local'
            }
        ]);
        expect(storageSpy).toHaveBeenCalledTimes(0);
        expect(cacheSpy).toHaveBeenCalledTimes(1);
    });
});
