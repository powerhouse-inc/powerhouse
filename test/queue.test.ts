import {
    actions,
    DocumentDriveDocument,
    utils as DocumentDriveUtils,
    reducer
} from 'document-model-libs/document-drive';
import * as BudgetStatement from 'document-model-libs/budget-statement';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { DocumentModel } from 'document-model/document';
import {
    module as DocumentModelLib,
} from 'document-model/document-model';
import { describe, it } from 'vitest';
import { DocumentDriveServer } from '../src/server';
import { MemoryStorage } from '../src/storage/memory';
import { generateUUID, IOperationResult } from '../src';
import { BaseQueueManager } from '../src/queue/base';
import { buildOperation, buildOperations } from './utils';
import InMemoryCache from '../src/cache/memory';
import { RedisQueueManager } from '../src/queue/redis';
import { createClient, RedisClientType } from "redis"
import { IQueueManager } from '../src/queue/types';
const documentModels = [
    DocumentModelLib,
    ...Object.values(DocumentModelsLibs)
] as DocumentModel[];


const queueLayers = [
    ['Memory Queue', async () => new BaseQueueManager()],
    [
        'Redis Queue',
        async () => {
            const client = await createClient().connect();
            await client.flushAll();
            return new RedisQueueManager(3, 0, client as RedisClientType);
        }
    ]
] as unknown as [string, () => Promise<IQueueManager>][];

describe.each(queueLayers)(
    'Document Drive Server queuing with %s',
    (storageName, buildStorage) => {

        let CREATE_DRIVES = 10;
        let ADD_OPERATIONS_TO_DRIVE = 10;

        const createDrive = async (server: DocumentDriveServer) => {
            const driveState = await server.addDrive({
                global: {
                    id: generateUUID(),
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

            const drive = await server.getDrive(driveState.state.global.id);
            return drive;
        }

        const addOperationsToDrive = async (server: DocumentDriveServer, drive: DocumentDriveDocument, queue = true) => {
            const promisses = [];
            for (let i = 0; i < ADD_OPERATIONS_TO_DRIVE; i++) {
                const id = generateUUID();
                drive = reducer(
                    drive,
                    DocumentDriveUtils.generateAddNodeAction(
                        drive.state.global,
                        {
                            id,
                            name: id,
                            documentType: 'powerhouse/budget-statement',
                        },
                        ['global', 'local'],
                    )
                );
                promisses.push(queue ? server.queueDriveOperations(drive.state.global.id, drive.operations.global) : server.addDriveOperations(drive.state.global.id, drive.operations.global));
            }
            return Promise.all(promisses);
        }

        it("block document queue until ADD_FILE is processed", async ({ expect }) => {
            const server = new DocumentDriveServer(
                documentModels,
                new MemoryStorage()
            );
            await server.initialize();
            let drive = await createDrive(server);
            const driveId = drive.state.global.id;
            const driveOperations = buildOperations(reducer, drive, [
                actions.addFolder({ id: "folder 1", name: "folder 1" }),
                actions.addFile({ id: "file 1", name: "file 1", parentFolder: "folder 1", documentType: "powerhouse/budget-statement", synchronizationUnits: [{ syncId: "1", scope: "global", branch: "main" }] })]
            );
            let budget = BudgetStatement.utils.createDocument();
            const budgetOperation = buildOperation(BudgetStatement.reducer, budget, BudgetStatement.actions.addAccount({
                address: '0x123'
            }));

            const documentResult = server.queueOperations(driveId, "file 1", [budgetOperation]);
            await expect(server.getDocument(driveId, "file 1")).rejects.toThrowError("Document with id file 1 not found");
            const results = await server.queueDriveOperations(driveId, driveOperations);

            const errors = [results, await documentResult].filter(r => !!(r as IOperationResult).error);
            if (errors.length) {
                errors.forEach(error => console.error(error));
            }
            expect(errors.length).toBe(0);

            drive = await server.getDrive(driveId);
            expect(drive.state.global.nodes).toStrictEqual([
                expect.objectContaining({ id: "folder 1", name: "folder 1", kind: "folder", parentFolder: null }),
                expect.objectContaining({ id: "file 1", name: "file 1", kind: "file", parentFolder: "folder 1", documentType: "powerhouse/budget-statement", synchronizationUnits: [{ syncId: "1", scope: "global", branch: "main" }] }),
            ]);

            budget = await server.getDocument(driveId, "file 1") as BudgetStatement.BudgetStatementDocument;
            expect(budget.state.global.accounts).toStrictEqual([
                expect.objectContaining({ address: "0x123" }),
            ]);
        });

        it("orders strands correctly", async ({ expect }) => {

            const server = new DocumentDriveServer(
                documentModels,
                new MemoryStorage(),
                new InMemoryCache(),
                await buildStorage()
            );
            await server.initialize();
            let drive = await createDrive(server);
            const driveId = drive.state.global.id;
            const driveOperations = buildOperations(reducer, drive, [
                actions.addFolder({ id: "folder 1", name: "folder 1" }),
                actions.addFile({ id: "file 1", name: "file 1", parentFolder: "folder 1", documentType: "powerhouse/budget-statement", synchronizationUnits: [{ syncId: "1", scope: "global", branch: "main" }] })]
            );
            let budget = BudgetStatement.utils.createDocument();
            const budgetOperation = buildOperation(BudgetStatement.reducer, budget, BudgetStatement.actions.addAccount({
                address: '0x123'
            }));

            const results = await Promise.all([
                server.queueDriveOperations(driveId, [buildOperation(reducer, drive, actions.addFolder({ id: "folder 2", name: "folder 2" }))]),
                server.queueDriveOperations(driveId, driveOperations),
                server.queueOperations(driveId, "file 1", [budgetOperation])
            ]);

            const errors = results.flat().filter(r => !!(r as IOperationResult).error);
            if (errors.length) {
                errors.forEach(error => console.error(error));
            }
            expect(errors.length).toBe(0);

            drive = await server.getDrive(driveId);
            expect(drive.state.global.nodes).toStrictEqual([
                expect.objectContaining({ id: "folder 1", name: "folder 1", kind: "folder", parentFolder: null }),
                expect.objectContaining({ id: "file 1", name: "file 1", kind: "file", parentFolder: "folder 1", documentType: "powerhouse/budget-statement", synchronizationUnits: [{ syncId: "1", scope: "global", branch: "main" }] }),
                expect.objectContaining({ id: "folder 2", name: "folder 2", kind: "folder", parentFolder: null }),
            ]);

            budget = await server.getDocument(driveId, "file 1") as BudgetStatement.BudgetStatementDocument;
            expect(budget.state.global.accounts).toStrictEqual([
                expect.objectContaining({ address: "0x123" }),
            ]);
        });

        it("it blocks a document queue when the drive queue processes a delete node operation", async ({ expect }) => {
            const server = new DocumentDriveServer(
                documentModels,
                new MemoryStorage(),
                new InMemoryCache(),
                await buildStorage()
            );
            await server.initialize();
            let drive = await createDrive(server);
            const driveId = drive.state.global.id;

            let budget = BudgetStatement.utils.createDocument();

            // first doc op
            const budgetOperation = buildOperation(BudgetStatement.reducer, budget, BudgetStatement.actions.addAccount({
                address: '0x123'
            }));

            // second doc op
            const budgetOperation2 = buildOperation(BudgetStatement.reducer, budget, BudgetStatement.actions.addAccount({
                address: '0x123456'
            }));

            // add file op
            const driveOperations = buildOperations(reducer, drive, [
                actions.addFile({ id: "file 1", name: "file 1", parentFolder: "folder 1", documentType: "powerhouse/budget-statement", synchronizationUnits: [{ syncId: "1", scope: "global", branch: "main" }] })]
            );



            // queue addFile and first doc op
            const results1 = await Promise.all([
                server.queueDriveOperations(driveId, driveOperations),
                server.queueOperations(driveId, "file 1", [budgetOperation]),
            ]);

            const errors = results1.flat().filter(r => !!(r as IOperationResult).error);
            if (errors.length) {
                errors.forEach(error => console.error(error));
            }

            // delete node op
            drive = await server.getDrive(driveId);
            const deleteNode = buildOperations(reducer, drive, [
                actions.deleteNode({ id: "file 1" })
            ]);

            // queue delete node op
            await server.queueDriveOperations(driveId, deleteNode)
            // ==> receives deleteNode and addFile operation?


            await expect(server.queueOperations(driveId, "file 1", [budgetOperation2])).rejects.toThrowError("Queue is deleted");

            drive = await server.getDrive(driveId);
            expect(drive.state.global.nodes).toStrictEqual([]);
        });

        it("produces conflicts on addDriveOperations", async ({ expect }) => {
            const server = new DocumentDriveServer(
                documentModels,
                new MemoryStorage(),
                new InMemoryCache(),
                await buildStorage()
            );
            await server.initialize();
            const drives = await Promise.all(new Array(CREATE_DRIVES).fill(0).map(async (_, i) => {
                return createDrive(server);
            }));
            const driveResults = await Promise.all(drives.map((drive) => {
                expect(drive).toBeDefined();
                return addOperationsToDrive(server, drive!, false);
            }))

            expect(driveResults.flat().filter((f: any) => f.status === "CONFLICT").length).toBeGreaterThan(0);
        });

        it("produces no conflicts on queueDriveOperations", async ({ expect }) => {
            const server = new DocumentDriveServer(
                documentModels,
                new MemoryStorage(),
                new InMemoryCache(),
                await buildStorage()
            );
            await server.initialize();
            const drives = await Promise.all(new Array(CREATE_DRIVES).fill(0).map(async (_, i) => {
                return createDrive(server);
            }));

            const driveResults = await Promise.all(drives.map((drive) => {
                expect(drive).toBeDefined();
                return addOperationsToDrive(server, drive);
            }))
            expect(driveResults.flat().filter((f: any) => f.status === "CONFLICT").length).toBe(0);
        });
    });


