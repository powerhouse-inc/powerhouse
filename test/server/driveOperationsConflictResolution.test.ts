import * as DocumentDrive from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import {
    BaseAction,
    DocumentModel as BaseDocumentModel,
    Operation
} from 'document-model/document';
import { module as DocumentModelLib } from 'document-model/document-model';
import { beforeEach, describe, expect, it } from 'vitest';
import { DocumentDriveServer, IOperationResult } from '../../src';
import { DriveBasicClient } from '../utils';

describe('Drive Operations', () => {
    const documentModels = [
        DocumentModelLib,
        ...Object.values(DocumentModelsLibs)
    ] as BaseDocumentModel[];

    let server = new DocumentDriveServer(documentModels);
    beforeEach(async () => {
        server = new DocumentDriveServer(documentModels);
        await server.initialize();
    });

    const driveId = '1';

    async function buildDrive() {
        await server.addDrive({
            global: { id: driveId, name: 'test', icon: null, slug: null },
            local: {
                availableOffline: false,
                sharingType: 'PRIVATE',
                listeners: [],
                triggers: []
            }
        });

        return await server.getDrive(driveId);
    }

    it('should not re-apply existing operations', async () => {
        const initialDriveDocument = await buildDrive();
        let pushOperationResult: IOperationResult;

        DocumentDrive.utils.createDocument();

        const client1 = new DriveBasicClient(
            server,
            driveId,
            initialDriveDocument,
            DocumentDrive.reducer
        );

        const client2 = new DriveBasicClient(
            server,
            driveId,
            initialDriveDocument,
            DocumentDrive.reducer
        );

        client1.dispatchDriveAction(
            DocumentDrive.actions.addFolder({ id: '1', name: 'test1' })
        );
        pushOperationResult = await client1.pushOperationsToServer();
        expect(pushOperationResult.status).toBe('SUCCESS');

        client2.dispatchDriveAction(
            DocumentDrive.actions.addFolder({ id: '2', name: 'test2' })
        );
        pushOperationResult = await client2.pushOperationsToServer();
        expect(pushOperationResult.status).toBe('SUCCESS');

        await client1.syncDocument();
        expect(client1.getUnsyncedOperations()).toMatchObject([]);

        const syncedOperations = client1.getDocument().operations
            .global as Operation<
            DocumentDrive.DocumentDriveAction | BaseAction
        >[];
        client1.setUnsyncedOperations(syncedOperations);

        pushOperationResult = await client1.pushOperationsToServer();

        const drive = await server.getDrive(driveId);

        expect(drive.state.global.nodes.length).toBe(2);
        expect(drive.state.global.nodes).toMatchObject([
            { id: '1', name: 'test1' },
            { id: '2', name: 'test2' }
        ]);
        expect(drive.operations.global.length).toBe(3);
        expect(drive.operations.global).toMatchObject([
            {
                type: 'NOOP',
                input: {},
                scope: 'global',
                index: 0,
                skip: 0
            },
            {
                type: 'ADD_FOLDER',
                input: { id: '1', name: 'test1' },
                scope: 'global',
                index: 1,
                skip: 1
            },
            {
                type: 'ADD_FOLDER',
                input: { id: '2', name: 'test2' },
                scope: 'global',
                index: 2,
                skip: 0
            }
        ]);
    });

    it('should resolve conflicts when 5 clients are pushing changes to the same drive', async () => {
        const initialDriveDocument = await buildDrive();
        let pushOperationResult: IOperationResult;

        DocumentDrive.utils.createDocument();

        const client1 = new DriveBasicClient(
            server,
            driveId,
            initialDriveDocument,
            DocumentDrive.reducer
        );

        const client2 = new DriveBasicClient(
            server,
            driveId,
            initialDriveDocument,
            DocumentDrive.reducer
        );

        const client3 = new DriveBasicClient(
            server,
            driveId,
            initialDriveDocument,
            DocumentDrive.reducer
        );

        const client4 = new DriveBasicClient(
            server,
            driveId,
            initialDriveDocument,
            DocumentDrive.reducer
        );

        const client5 = new DriveBasicClient(
            server,
            driveId,
            initialDriveDocument,
            DocumentDrive.reducer
        );

        // Client1 Add folder and push to server
        client1.dispatchDriveAction(
            DocumentDrive.actions.addFolder({ id: '1', name: 'test1' })
        );
        pushOperationResult = await client1.pushOperationsToServer();
        expect(pushOperationResult.status).toBe('SUCCESS');

        // Client2 Add folder and push to server
        client2.dispatchDriveAction(
            DocumentDrive.actions.addFolder({ id: '2', name: 'test2' })
        );
        pushOperationResult = await client2.pushOperationsToServer();
        expect(pushOperationResult.status).toBe('SUCCESS');

        // Client1 sync with server
        await client1.syncDocument();
        expect(client1.getUnsyncedOperations()).toMatchObject([]);

        // Clien1 push already synced operations to server (this should not create new operations in the server document)
        const syncedOperations = client1.getDocument().operations
            .global as Operation<
            DocumentDrive.DocumentDriveAction | BaseAction
        >[];

        client1.setUnsyncedOperations(syncedOperations);
        pushOperationResult = await client1.pushOperationsToServer();

        // Client3 sync with server
        await client3.syncDocument();

        // Client3 add folder and push to server
        client3.dispatchDriveAction(
            DocumentDrive.actions.addFolder({ id: '3', name: 'test3' })
        );
        pushOperationResult = await client3.pushOperationsToServer();
        expect(pushOperationResult.status).toBe('SUCCESS');

        // Client4 sync with server (partially syncs at this point)
        await client4.syncDocument();

        // Client3 add folder and push to server
        client3.dispatchDriveAction(
            DocumentDrive.actions.addFolder({ id: '4', name: 'test4' })
        );
        pushOperationResult = await client3.pushOperationsToServer();
        expect(pushOperationResult.status).toBe('SUCCESS');

        // Client4 add folder and push to server
        client4.dispatchDriveAction(
            DocumentDrive.actions.addFolder({ id: '5', name: 'test5' })
        );
        pushOperationResult = await client4.pushOperationsToServer();
        expect(pushOperationResult.status).toBe('SUCCESS');

        // Client5 add folder and push to server
        client5.dispatchDriveAction(
            DocumentDrive.actions.addFolder({ id: '6', name: 'test6' })
        );
        pushOperationResult = await client5.pushOperationsToServer();
        expect(pushOperationResult.status).toBe('SUCCESS');

        // Check if the operations are in the server
        const drive = await server.getDrive(driveId);

        expect(drive.state.global.nodes.length).toBe(6);
        expect(drive.state.global.nodes).toMatchObject([
            { id: '1', name: 'test1' },
            { id: '2', name: 'test2' },
            { id: '3', name: 'test3' },
            { id: '4', name: 'test4' },
            { id: '5', name: 'test5' },
            { id: '6', name: 'test6' }
        ]);
        expect(drive.operations.global.slice(-6)).toMatchObject([
            {
                type: 'ADD_FOLDER',
                input: { id: '1', name: 'test1' },
                scope: 'global',
                index: 7,
                skip: 7
            },
            {
                type: 'ADD_FOLDER',
                input: { id: '2', name: 'test2' },
                scope: 'global',
                index: 8,
                skip: 0
            },
            {
                type: 'ADD_FOLDER',
                input: { id: '3', name: 'test3' },
                scope: 'global',
                index: 9,
                skip: 0
            },
            {
                type: 'ADD_FOLDER',
                input: { id: '4', name: 'test4' },
                scope: 'global',
                index: 10,
                skip: 0
            },
            {
                type: 'ADD_FOLDER',
                input: { id: '5', name: 'test5' },
                scope: 'global',
                index: 11,
                skip: 0
            },
            {
                type: 'ADD_FOLDER',
                input: { id: '6', name: 'test6' },
                scope: 'global',
                index: 12,
                skip: 0
            }
        ]);
    });
});
