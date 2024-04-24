import { PrismaClient } from '@prisma/client';
import {
    utils as DocumentDriveUtils,
    actions,
    reducer
} from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { ActionContext, DocumentModel } from 'document-model/document';
import {
    actions as DocumentModelActions,
    DocumentModelDocument,
    module as DocumentModelLib,
    utils as DocumentModelUtils
} from 'document-model/document-model';
import fs from 'fs/promises';
import path from 'path';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { DocumentDriveServer } from '../src/server';
import { BrowserStorage } from '../src/storage/browser';
import { FilesystemStorage } from '../src/storage/filesystem';
import { MemoryStorage } from '../src/storage/memory';
import { PrismaStorage } from '../src/storage/prisma';
import { SequelizeStorage } from '../src/storage/sequelize';
import { IDriveStorage } from '../src/storage/types';
import { expectUUID } from './utils';

const documentModels = [
    DocumentModelLib,
    ...Object.values(DocumentModelsLibs)
] as DocumentModel[];

const FileStorageDir = path.join(__dirname, './file-storage');
const prismaClient = new PrismaClient();
const storageLayers = [
    ['MemoryStorage', async () => new MemoryStorage()],
    ['FilesystemStorage', async () => new FilesystemStorage(FileStorageDir)],
    ['BrowserStorage', async () => new BrowserStorage()],
    ['PrismaStorage', async () => new PrismaStorage(prismaClient)],
    [
        'SequelizeStorage',
        async () => {
            const storage = new SequelizeStorage({
                dialect: 'sqlite',
                storage: ':memory:'
            });

            await storage.syncModels();
            return storage;
        }
    ]
] as unknown as [string, () => Promise<IDriveStorage>][];

describe.each(storageLayers)(
    'Document Drive Server with %s',
    (storageName, buildStorage) => {
        beforeEach(() => {
            vi.useFakeTimers().setSystemTime(new Date('2024-01-01'));
        });

        afterEach(async () => {
            vi.useRealTimers();

            if (storageName === 'FilesystemStorage') {
                return fs.rm(FileStorageDir, { recursive: true, force: true });
            } else if (storageName === "BrowserStorage") {
                return (await buildStorage()).clearStorage?.();
            } else if (storageName === 'PrismaStorage') {
                await prismaClient.$executeRawUnsafe(
                    'DELETE FROM "Attachment";'
                );
                await prismaClient.$executeRawUnsafe(
                    'DELETE FROM "Operation";'
                );
                await prismaClient.$executeRawUnsafe('DELETE FROM "Document";');
            }
        });

        it('adds drive to server', async ({ expect }) => {
            const server = new DocumentDriveServer(
                documentModels,
                await buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    slug: null
                },
                local: {
                    availableOffline: false,
                    sharingType: 'PUBLIC',
                    listeners: [],
                    triggers: []
                }
            });
            const drive = await server.getDrive('1');
            expect(drive.state).toStrictEqual(
                DocumentDriveUtils.createState({
                    global: {
                        id: '1',
                        name: 'name',
                        icon: 'icon',
                        slug: null
                    },
                    local: {
                        availableOffline: false,
                        sharingType: 'PUBLIC',
                        listeners: [],
                        triggers: []
                    }
                })
            );

            const drives = await server.getDrives();
            expect(drives).toStrictEqual(['1']);
        });

        it('adds file to server', async ({ expect }) => {
            const server = new DocumentDriveServer(
                documentModels,
                await buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    slug: 'slug'
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public',
                    listeners: [],
                    triggers: []
                }
            });
            let drive = await server.getDrive('1');
            // performs ADD_FILE operation locally
            drive = reducer(
                drive,
                DocumentDriveUtils.generateAddNodeAction(
                    drive.state.global,
                    {
                        id: '1.1',
                        name: 'document 1',
                        documentType: 'powerhouse/document-model'
                    },
                    ['global', 'local']
                )
            );

            // dispatches operation to server
            const operation = drive.operations.global[0]!;
            const operationResult = await server.addDriveOperation(
                '1',
                operation
            );
            expect(operationResult.status).toBe('SUCCESS');

            drive = await server.getDrive('1');
            expect(drive.state).toStrictEqual(operationResult.document?.state);

            expect(drive.state.global.nodes[0]).toStrictEqual({
                id: '1.1',
                kind: 'file',
                name: 'document 1',
                documentType: 'powerhouse/document-model',
                parentFolder: null,
                synchronizationUnits: [
                    {
                        branch: 'main',
                        scope: 'global',
                        syncId: expectUUID(expect)
                    },
                    {
                        branch: 'main',
                        scope: 'local',
                        syncId: expectUUID(expect)
                    }
                ]
            });
        });

        it('creates new document of the correct document type when file is added to server', async ({
            expect
        }) => {
            const server = new DocumentDriveServer(
                documentModels,
                await buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    slug: 'slug'
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public',
                    listeners: [],
                    triggers: []
                }
            });
            let drive = await server.getDrive('1');
            drive = reducer(
                drive,
                DocumentDriveUtils.generateAddNodeAction(
                    drive.state.global,
                    {
                        id: '1.1',
                        name: 'document 1',
                        documentType: 'powerhouse/document-model'
                    },
                    ['global', 'local']
                )
            );
            const operation = drive.operations.global[0]!;

            const result = await server.addDriveOperation('1', operation);
            expect(result.status).toBe('SUCCESS');

            const document = await server.getDocument('1', '1.1');
            expect(document.documentType).toBe('powerhouse/document-model');
            expect(document.state).toStrictEqual(
                DocumentModelUtils.createState()
            );

            const driveDocuments = await server.getDocuments('1');
            expect(driveDocuments).toStrictEqual(['1.1']);
        });

        it('deletes file from server', async ({ expect }) => {
            const server = new DocumentDriveServer(
                documentModels,
                await buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    slug: 'slug'
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public',
                    listeners: [],
                    triggers: []
                }
            });
            let drive = await server.getDrive('1');

            // adds file
            drive = reducer(
                drive,
                DocumentDriveUtils.generateAddNodeAction(
                    drive.state.global,
                    {
                        id: '1.1',
                        name: 'document 1',
                        documentType: 'powerhouse/document-model'
                    },
                    ['global', 'local']
                )
            );
            let result = await server.addDriveOperation(
                '1',
                drive.operations.global[0]!
            );
            expect(result.status).toBe('SUCCESS');

            // removes file
            drive = reducer(
                drive,
                actions.deleteNode({
                    id: '1.1'
                })
            );
            result = await server.addDriveOperation(
                '1',
                drive.operations.global[1]!
            );
            expect(result.status).toBe('SUCCESS');

            const serverDrive = await server.getDrive('1');
            expect(serverDrive.state.global.nodes).toStrictEqual([]);
        });

        it('deletes document when file is removed from server', async ({
            expect
        }) => {
            const server = new DocumentDriveServer(
                documentModels,
                await buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    slug: 'slug'
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public',
                    listeners: [],
                    triggers: []
                }
            });
            let drive = await server.getDrive('1');
            drive = reducer(
                drive,
                DocumentDriveUtils.generateAddNodeAction(
                    drive.state.global,
                    {
                        id: '1.1',
                        name: 'document 1',
                        documentType: 'powerhouse/document-model'
                    },
                    ['global', 'local']
                )
            );
            drive = reducer(
                drive,
                actions.deleteNode({
                    id: '1.1'
                })
            );

            const result = await server.addDriveOperations(
                '1',
                drive.operations.global
            );
            expect(result.status).toBe('SUCCESS');

            const documents = await server.getDocuments('1');
            expect(documents).toStrictEqual([]);

            expect(server.getDocument('1', '1.1')).rejects.toThrowError(
                'Document with id 1.1 not found'
            );
        });

        it('deletes documents inside a folder when it is removed from a drive', async ({
            expect
        }) => {
            const server = new DocumentDriveServer(
                documentModels,
                await buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    slug: 'slug'
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public',
                    listeners: [],
                    triggers: []
                }
            });
            let drive = await server.getDrive('1');

            drive = reducer(
                drive,
                actions.addFolder({
                    id: '1.1',
                    name: 'document 1'
                })
            );
            drive = reducer(
                drive,
                DocumentDriveUtils.generateAddNodeAction(
                    drive.state.global,
                    {
                        id: '1.1.1',
                        name: 'document 1',
                        documentType: 'powerhouse/document-model',

                        parentFolder: '1.1'
                    },
                    ['global', 'local']
                )
            );
            drive = reducer(
                drive,
                actions.deleteNode({
                    id: '1.1'
                })
            );

            const result = await server.addDriveOperations(
                '1',
                drive.operations.global
            );
            expect(result.status).toBe('SUCCESS');

            const documents = await server.getDocuments('1');
            expect(documents).toStrictEqual([]);

            expect(server.getDocument('1', '1.1')).rejects.toThrowError(
                'Document with id 1.1 not found'
            );
        });

        it('deletes drive from server', async ({ expect }) => {
            const server = new DocumentDriveServer(
                documentModels,
                await buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    slug: 'slug'
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public',
                    listeners: [],
                    triggers: []
                }
            });

            await server.deleteDrive('1');

            const drives = await server.getDrives();
            expect(drives).toStrictEqual([]);
        });

        it('deletes documents when drive is deleted from server', async ({
            expect
        }) => {
            const server = new DocumentDriveServer(
                documentModels,
                await buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    slug: 'slug'
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public',
                    listeners: [],
                    triggers: []
                }
            });

            let drive = await server.getDrive('1');
            drive = reducer(
                drive,
                DocumentDriveUtils.generateAddNodeAction(
                    drive.state.global,
                    {
                        id: '1.1.1',
                        name: 'document 1',
                        documentType: 'powerhouse/document-model'
                    },
                    ['global', 'local']
                )
            );

            const result = await server.addDriveOperation(
                '1',
                drive.operations.global[0]!
            );
            expect(result.status).toBe('SUCCESS');

            await server.deleteDrive('1');

            const documents = await server.getDocuments('1');
            expect(documents).toStrictEqual([]);
        });

        it('renames drive', async ({ expect }) => {
            const server = new DocumentDriveServer(
                documentModels,
                await buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    slug: 'slug'
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public',
                    listeners: [],
                    triggers: []
                }
            });
            let drive = await server.getDrive('1');
            drive = reducer(
                drive,
                actions.setDriveName({
                    name: 'new name'
                })
            );

            const result = await server.addDriveOperation(
                '1',
                drive.operations.global[0]!
            );
            expect(result.status).toBe('SUCCESS');

            drive = await server.getDrive('1');
            expect(drive.state.global.name).toBe('new name');
        });

        it('copies document when file is copied drive', async ({ expect }) => {
            const server = new DocumentDriveServer(
                documentModels,
                await buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    slug: 'slug'
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public',
                    listeners: [],
                    triggers: []
                }
            });
            let drive = await server.getDrive('1');
            drive = reducer(
                drive,
                actions.addFolder({
                    id: '1',
                    name: '1'
                })
            );
            drive = reducer(
                drive,
                actions.addFolder({
                    id: '2',
                    name: '2'
                })
            );
            drive = reducer(
                drive,
                DocumentDriveUtils.generateAddNodeAction(
                    drive.state.global,
                    {
                        id: '1.1',
                        name: '1.1',
                        documentType: 'powerhouse/document-model',
                        parentFolder: '1'
                    },
                    ['global', 'local']
                )
            );
            drive = reducer(
                drive,
                DocumentDriveUtils.generateCopyNodeAction(drive.state.global, {
                    srcId: '1.1',
                    targetId: '2.1',
                    targetName: '2.2',
                    targetParentFolder: '2'
                })
            );
            const result = await server.addDriveOperations(
                '1',
                drive.operations.global
            );

            expect(result.status).toBe('SUCCESS');

            drive = await server.getDrive('1');
            const document = await server.getDocument('1', '1.1');
            const documentB = await server.getDocument('1', '2.1');
            expect(document).toStrictEqual(documentB);
        });

        it('adds document operation', async ({ expect }) => {
            const server = new DocumentDriveServer(
                documentModels,
                await buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    slug: 'slug'
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public',
                    listeners: [],
                    triggers: []
                }
            });
            let drive = await server.getDrive('1');

            // adds file
            drive = reducer(
                drive,
                DocumentDriveUtils.generateAddNodeAction(
                    drive.state.global,
                    {
                        id: '1.1',
                        name: 'document 1',
                        documentType: 'powerhouse/document-model'
                    },
                    ['global', 'local']
                )
            );
            await server.addDriveOperation('1', drive.operations.global[0]!);

            let document = (await server.getDocument(
                '1',
                '1.1'
            )) as DocumentModelDocument;
            document = DocumentModelLib.reducer(
                document,
                DocumentModelActions.setName('Test')
            );
            const operation = document.operations.global[0]!;
            const result = await server.addOperation('1', '1.1', operation);
            expect(result.status).toBe('SUCCESS');
            expect(result.operations[0]).toStrictEqual(operation);

            const storedDocument = await server.getDocument('1', '1.1');
            expect(storedDocument.state).toStrictEqual(document.state);
            expect(storedDocument.operations).toStrictEqual(
                document.operations
            );
        });

        it('saves operation context', async ({ expect }) => {
            const server = new DocumentDriveServer(
                documentModels,
                await buildStorage()
            );
            await server.addDrive({
                global: {
                    id: '1',
                    name: 'name',
                    icon: 'icon',
                    slug: 'slug'
                },
                local: {
                    availableOffline: false,
                    sharingType: 'public',
                    listeners: [],
                    triggers: []
                }
            });
            let drive = await server.getDrive('1');


            const context: ActionContext = {
                signer: {
                    user: {
                        address: '123',
                        networkId: '1',
                        chainId: 1
                    },
                    app: {
                        name: 'name',
                        key: 'key'
                    },
                    signature: "test"
                }
            }

            drive = reducer(
                drive,
                {
                    ...DocumentDriveUtils.generateAddNodeAction(
                        drive.state.global,
                        {
                            id: '1.1',
                            name: 'document 1',
                            documentType: 'powerhouse/document-model'
                        },
                        ['global', 'local'],

                    ), context
                }
            );

            // dispatches operation to server
            const operation = drive.operations.global[0]!;
            const operationResult = await server.addDriveOperation(
                '1',
                operation
            );
            expect(operationResult.status).toBe('SUCCESS');

            drive = await server.getDrive('1');
            expect(drive.operations.global[0]?.context).toStrictEqual(context);
        });
    }
);
