import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { DocumentModel as BaseDocumentModel } from 'document-model/document';
import { module as DocumentModelLib } from 'document-model/document-model';
import { describe, expect, it, vi } from 'vitest';
import {
    DefaultRemoteDriveInput,
    DocumentDriveServer,
    DocumentDriveServerOptions
} from '../src';
import { MemoryStorage } from '../src/storage/memory';

const remoteDriveUrl =
    'https://apps.powerhouse.io/develop/powerhouse/switchboard/d/drive-unit-test';
const remoteDriveId = 'drive-unit-test';

const defaultRemoteDriveInput: DefaultRemoteDriveInput = {
    url: remoteDriveUrl,
    options: {
        sharingType: 'PUBLIC',
        availableOffline: true,
        listeners: [
            {
                block: true,
                callInfo: {
                    data: remoteDriveUrl,
                    name: 'switchboard-push',
                    transmitterType: 'SwitchboardPush'
                },
                filter: {
                    branch: ['main'],
                    documentId: ['*'],
                    documentType: ['*'],
                    scope: ['global']
                },
                label: 'Switchboard Sync',
                listenerId: '1',
                system: true
            }
        ],
        triggers: [],
        pullInterval: 3000
    }
};

const documentDriveServerOptions: DocumentDriveServerOptions = {
    defaultRemoteDrives: [defaultRemoteDriveInput]
};

vi.mock('graphql-request', () => ({
    GraphQLClient: vi.fn().mockImplementation(() => ({
        request: vi.fn().mockImplementation((query: string) => {
            if (query.includes('query getDrive')) {
                return Promise.resolve({
                    drive: {
                        id: 'drive-unit-test',
                        name: 'DriveUnitTest',
                        icon: null,
                        slug: 'drive-unit-test'
                    }
                });
            }

            if (query.includes('query strands')) {
                return Promise.resolve({
                    system: {
                        sync: {
                            strands: []
                        }
                    }
                });
            }

            if (query.includes('mutation registerPullResponderListener')) {
                return Promise.resolve({
                    registerPullResponderListener: {
                        listenerId: 'be3004e7-5ef9-4408-b05c-bb917b94f0e8'
                    }
                });
            }

            return Promise.resolve({});
        })
    })),
    gql: vi.fn().mockImplementation((...args) => args.join(''))
}));

describe('default remote drives', () => {
    const documentModels = [
        DocumentModelLib,
        ...Object.values(DocumentModelsLibs)
    ] as BaseDocumentModel[];

    it('should add a remote default remote drives added in the config object', async () => {
        const server = new DocumentDriveServer(
            documentModels,
            undefined,
            undefined,
            undefined,
            documentDriveServerOptions
        );

        await server.initialize();

        expect(true).toBe(true);
        const drives = await server.getDrives();

        expect(drives).toHaveLength(1);
        expect(drives).toMatchObject([remoteDriveId]);
    });

    it('should start defaultRemoteDrives with pending state', () => {
        const server = new DocumentDriveServer(
            documentModels,
            undefined,
            undefined,
            undefined,
            documentDriveServerOptions
        );

        const defaultRemoteDriveConfig = server
            .getDefaultRemoteDrives()
            .get(remoteDriveUrl);

        expect(defaultRemoteDriveConfig).toMatchObject({
            url: remoteDriveUrl,
            status: 'PENDING'
        });
    });

    it('should emit messages when a remote drive is added', async () => {
        const server = new DocumentDriveServer(
            documentModels,
            undefined,
            undefined,
            undefined,
            documentDriveServerOptions
        );

        const mockCallback = vi.fn();

        server.on('defaultRemoteDrive', mockCallback);

        await server.initialize();

        expect(mockCallback).toHaveBeenCalledTimes(2);
        expect(mockCallback.mock.calls[0][0]).toBe('ADDING');
        expect(mockCallback.mock.calls[0][3]).toBe(undefined);
        expect(mockCallback.mock.calls[1][0]).toBe('SUCCESS');
        expect(mockCallback.mock.calls[1][3]).toBe('drive-unit-test');
    });

    it('should not add an existing remote drive', async () => {
        const storage = new MemoryStorage();
        const server1 = new DocumentDriveServer(
            documentModels,
            storage,
            undefined,
            undefined,
            documentDriveServerOptions
        );

        await server1.initialize();

        const server2 = new DocumentDriveServer(
            documentModels,
            storage,
            undefined,
            undefined,
            documentDriveServerOptions
        );

        const mockCallback = vi.fn();

        server2.on('defaultRemoteDrive', mockCallback);
        await server2.initialize();

        expect(mockCallback).toHaveBeenCalledTimes(1);
        expect(mockCallback.mock.calls[0][0]).toBe('ALREADY_ADDED');
        expect(mockCallback.mock.calls[0][3]).toBe('drive-unit-test');
    });
});
