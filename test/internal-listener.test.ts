import { utils } from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import { DocumentModel } from 'document-model/document';
import * as DocumentModelLib from 'document-model/document-model';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    test,
    vi,
    vitest
} from 'vitest';
import { DocumentDriveServer, IReceiver } from '../src';

describe('Internal Listener', () => {
    const documentModels = [
        DocumentModelLib,
        ...Object.values(DocumentModelsLibs)
    ] as DocumentModel[];

    async function buildServer(receiver: IReceiver) {
        const server = new DocumentDriveServer(documentModels);
        await server.initialize();

        await server.addDrive({
            global: {
                id: 'drive',
                name: 'Global Drive',
                icon: '',
                slug: 'global'
            },
            local: {
                availableOffline: false,
                listeners: [],
                sharingType: 'private',
                triggers: []
            }
        });
        await server.addInternalListener('drive', receiver, {
            block: true,
            filter: {
                branch: ['main'],
                documentId: ['*'],
                documentType: ['*'],
                scope: ['global']
            },
            label: 'Internal',
            listenerId: 'internal'
        });
        return server;
    }

    beforeEach(() => {
        vi.useFakeTimers().setSystemTime(new Date('2024-01-01'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should call transmit function of listener and acknowledge', async () => {
        const transmitFn = vitest.fn(() => Promise.resolve());

        const server = await buildServer({ transmit: transmitFn });
        const drive = await server.getDrive('drive');

        await server.addDriveAction(
            'drive',
            utils.generateAddNodeAction(
                drive.state.global,
                {
                    id: '1',
                    name: 'test',
                    documentType: 'powerhouse/document-model'
                },
                ['global', 'local']
            )
        );

        await vi.waitFor(() => expect(transmitFn).toHaveBeenCalledTimes(1));
        expect(transmitFn).toHaveBeenCalledWith([
            {
                branch: 'main',
                documentId: '',
                driveId: 'drive',
                operations: [
                    {
                        hash: 'XsiPXaQJ0Lk4Y6CKyEkaFatdbLo=',
                        index: 0,
                        input: {
                            documentType: 'powerhouse/document-model',
                            id: '1',
                            name: 'test',
                            scopes: ['global', 'local']
                        },
                        skip: 0,
                        timestamp: '2024-01-01T00:00:00.000Z',
                        type: 'ADD_FILE'
                    }
                ],
                state: {
                    icon: '',
                    id: 'drive',
                    name: 'Global Drive',
                    nodes: [
                        {
                            documentType: 'powerhouse/document-model',
                            id: '1',
                            kind: 'file',
                            name: 'test',
                            parentFolder: null,
                            scopes: ['global', 'local'],
                            synchronizationUnits: [
                                {
                                    branch: 'main',
                                    scope: 'global',
                                    syncId: '1'
                                },
                                {
                                    branch: 'main',
                                    scope: 'local',
                                    syncId: '2'
                                }
                            ]
                        }
                    ],
                    slug: 'global'
                },
                scope: 'global'
            }
        ]);

        await server.addAction(
            'drive',
            '1',
            DocumentModelLib.actions.setModelName({ name: 'test' })
        );

        await vi.waitFor(() => expect(transmitFn).toHaveBeenCalledTimes(2));
        expect(transmitFn).toHaveBeenLastCalledWith([
            {
                branch: 'main',
                documentId: '1',
                driveId: 'drive',
                operations: [
                    {
                        hash: 'nWKpqR6ns0l8C/Khwrl+SyKy0sA=',
                        index: 0,
                        input: {
                            name: 'test'
                        },
                        skip: 0,
                        timestamp: '2024-01-01T00:00:00.100Z',
                        type: 'SET_MODEL_NAME'
                    }
                ],
                state: {
                    author: {
                        name: '',
                        website: ''
                    },
                    description: '',
                    extension: '',
                    id: '',
                    name: 'test',
                    specifications: [
                        {
                            changeLog: [],
                            modules: [],
                            state: {
                                global: {
                                    examples: [],
                                    initialValue: '',
                                    schema: ''
                                },
                                local: {
                                    examples: [],
                                    initialValue: '',
                                    schema: ''
                                }
                            },
                            version: 1
                        }
                    ]
                },
                scope: 'global'
            }
        ]);

        await server.addAction(
            'drive',
            '1',
            DocumentModelLib.actions.setModelName({ name: 'test 2' })
        );

        await vi.waitFor(() => expect(transmitFn).toHaveBeenCalledTimes(3));
        expect(transmitFn).toHaveBeenLastCalledWith([
            {
                branch: 'main',
                documentId: '1',
                driveId: 'drive',
                operations: [
                    {
                        hash: 's7RBcer0JqjSGvNb12gqpeeJGRY=',
                        index: 1,
                        input: {
                            name: 'test 2'
                        },
                        skip: 0,
                        timestamp: '2024-01-01T00:00:00.200Z',
                        type: 'SET_MODEL_NAME'
                    }
                ],
                state: {
                    author: {
                        name: '',
                        website: ''
                    },
                    description: '',
                    extension: '',
                    id: '',
                    name: 'test 2',
                    specifications: [
                        {
                            changeLog: [],
                            modules: [],
                            state: {
                                global: {
                                    examples: [],
                                    initialValue: '',
                                    schema: ''
                                },
                                local: {
                                    examples: [],
                                    initialValue: '',
                                    schema: ''
                                }
                            },
                            version: 1
                        }
                    ]
                },
                scope: 'global'
            }
        ]);
    });
});
