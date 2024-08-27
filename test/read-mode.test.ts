import * as BudgetStatement from 'document-model-libs/budget-statement';
import * as DocumentDrive from 'document-model-libs/document-drive';
import * as documentModelsMap from 'document-model-libs/document-models';
import { DocumentModel } from 'document-model/document';
import { beforeEach } from 'node:test';
import { describe, it, vi } from 'vitest';
import createFetchMock from 'vitest-fetch-mock';
import {
    ReadDocumentNotFoundError,
    ReadDriveContext,
    ReadDriveNotFoundError,
    ReadDriveSlugNotFoundError,
    ReadModeStorage
} from '../src/storage/read-mode';

const fetchMocker = createFetchMock(vi);
fetchMocker.enableMocks();

const documentModels = Object.values(documentModelsMap) as DocumentModel[];

function getDocumentModel(id: string) {
    const documentModel = documentModels.find(d => d.documentModel.id === id);
    if (!documentModel) {
        throw new Error(`Document model not found for id: ${id}`);
    }
    return documentModel;
}

describe('Read mode methods', () => {
    beforeEach(() => {
        fetchMocker.resetMocks();
    });

    it('should return read drive when drive ID is found in read drives', async ({
        expect
    }) => {
        const readModeStorage = new ReadModeStorage(getDocumentModel);
        const readDriveId = 'read-drive';
        const context: ReadDriveContext = {
            url: `https://switchboard.com/d/${readDriveId}`,
            filter: {
                branch: ['*'],
                documentId: ['*'],
                documentType: ['*'],
                scope: ['*']
            }
        };
        const driveData = {
            id: readDriveId,
            name: 'Read drive',
            documentType: '',
            created: '',
            lastModified: '',
            state: {
                icon: null,
                id: readDriveId,
                name: 'Read drive',
                nodes: [],
                slug: 'read-drive'
            }
        };

        fetchMocker.mockIf(context.url, () => ({
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                data: {
                    document: driveData
                }
            })
        }));

        await readModeStorage.addReadDrive(readDriveId, context);

        expect(fetchMocker).toHaveBeenCalledWith(context.url, {
            body: '{"query":"\\n            query ($id: String!) {\\n                document(id: $id) {\\n                    id\\n                    name\\n                    state {\\n                        ... on DocumentDrive { state { id name nodes { ... on FolderNode { id name kind parentFolder } ... on FileNode { id name kind documentType parentFolder synchronizationUnits { syncId scope branch } } } icon slug }\\n                    }\\n                }\\n            }\\n        ","variables":{"id":"read-drive"}}',
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST'
        });

        const result = await readModeStorage.getReadDrive(readDriveId);
        expect(result).toStrictEqual({
            id: readDriveId,
            name: 'Read drive',
            documentType: '',
            created: '',
            lastModified: '',
            state: {
                global: {
                    icon: null,
                    id: readDriveId,
                    name: 'Read drive',
                    nodes: [],
                    slug: 'read-drive'
                }
            }
        });

        const resultContext =
            await readModeStorage.getReadDriveContext(readDriveId);
        expect(resultContext).toStrictEqual(context);
    });

    it('should return existing read drive for given slug', async ({
        expect
    }) => {
        const readModeStorage = new ReadModeStorage(getDocumentModel);
        const readDriveId = 'read-drive';
        const context: ReadDriveContext = {
            url: `https://switchboard.com/d/${readDriveId}`,
            filter: {
                branch: ['*'],
                documentId: ['*'],
                documentType: ['*'],
                scope: ['*']
            }
        };
        const driveData = {
            id: readDriveId,
            name: 'Read drive',
            documentType: '',
            created: '',
            lastModified: '',
            state: {
                icon: null,
                id: readDriveId,
                name: 'Read drive',
                nodes: [],
                slug: 'read-drive'
            }
        };

        fetchMocker.mockIf(context.url, () => ({
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                data: {
                    document: driveData
                }
            })
        }));

        await readModeStorage.addReadDrive(readDriveId, context);
        const result = await readModeStorage.getReadDriveBySlug('read-drive');
        expect(result).toStrictEqual({
            id: readDriveId,
            name: 'Read drive',
            documentType: '',
            created: '',
            lastModified: '',
            state: {
                global: {
                    icon: null,
                    id: readDriveId,
                    name: 'Read drive',
                    nodes: [],
                    slug: 'read-drive'
                }
            }
        });
    });

    it('should delete read drive', async ({ expect }) => {
        const readModeStorage = new ReadModeStorage(getDocumentModel);
        const readDriveId = 'read-drive';
        const context: ReadDriveContext = {
            url: `https://switchboard.com/d/${readDriveId}`,
            filter: {
                branch: ['*'],
                documentId: ['*'],
                documentType: ['*'],
                scope: ['*']
            }
        };
        const driveData = {
            id: readDriveId,
            name: 'Read drive',
            documentType: '',
            created: '',
            lastModified: '',
            state: {
                icon: null,
                id: readDriveId,
                name: 'Read drive',
                nodes: [],
                slug: 'read-drive'
            }
        };

        fetchMocker.mockIf(context.url, () => ({
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                data: {
                    document: driveData
                }
            })
        }));

        await readModeStorage.addReadDrive(readDriveId, context);
        const result = await readModeStorage.deleteReadDrive(readDriveId);
        expect(result).toBeUndefined();

        const result2 = await readModeStorage.deleteReadDrive(readDriveId);
        expect(result2).toStrictEqual(new ReadDriveNotFoundError(readDriveId));
    });

    it('should return read document from drive', async ({ expect }) => {
        const readDriveId = 'read-drive';
        const documentId = 'budget-statement';
        let drive = DocumentDrive.utils.createDocument({
            state: {
                global: {
                    id: readDriveId,
                    name: 'Read drive',
                    nodes: [],
                    icon: null,
                    slug: 'read-drive'
                },
                local: {}
            }
        });
        let budgetStatement = BudgetStatement.utils.createDocument({
            name: 'budget-statement'
        });
        const addNodeAction = DocumentDrive.actions.addFile({
            name: 'Document 1',
            documentType: BudgetStatement.documentModel.id,
            id: documentId,
            synchronizationUnits: [
                { syncId: 'document-1', scope: '1', branch: '1' }
            ]
        });

        drive = DocumentDrive.reducer(drive, addNodeAction);
        budgetStatement = BudgetStatement.reducer(
            budgetStatement,
            BudgetStatement.actions.addAccount({
                address: '0x123'
            })
        );

        const readModeStorage = new ReadModeStorage(getDocumentModel);
        const context: ReadDriveContext = {
            url: `https://switchboard.com/d/${readDriveId}`,
            filter: {
                branch: ['*'],
                documentId: ['*'],
                documentType: ['*'],
                scope: ['*']
            }
        };

        fetchMocker.mockOnceIf(context.url, () => ({
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                data: {
                    document: {
                        id: readDriveId,
                        name: '',
                        state: drive.state.global
                    }
                }
            })
        }));

        await readModeStorage.addReadDrive(readDriveId, context);

        const drives = await readModeStorage.getReadDrives();
        expect(drives).toStrictEqual([readDriveId]);

        const readDrive = await readModeStorage.getReadDrive(readDriveId);
        expect(readDrive).toMatchObject({
            id: readDriveId,
            name: '',
            state: {
                global: {
                    icon: null,
                    id: readDriveId,
                    name: 'Read drive',
                    nodes: [
                        {
                            documentType: 'powerhouse/budget-statement',
                            id: 'budget-statement',
                            kind: 'file',
                            name: 'Document 1',
                            parentFolder: null,
                            synchronizationUnits: [
                                {
                                    branch: '1',
                                    scope: '1',
                                    syncId: 'document-1'
                                }
                            ]
                        }
                    ],
                    slug: 'read-drive'
                }
            }
        });

        fetchMocker.mockOnceIf(context.url, () => {
            return {
                headers: { 'content-type': 'application/json; charset=utf-8' },
                body: JSON.stringify({
                    data: {
                        document: {
                            id: documentId,
                            name: 'budget-statement',
                            state: budgetStatement.state.global
                        }
                    }
                })
            };
        });

        const readDocument = await readModeStorage.fetchDocumentState(
            readDriveId,
            documentId,
            BudgetStatement.documentModel.id
        );

        expect(readDocument).toMatchObject({
            id: documentId,
            name: 'budget-statement',
            state: {
                global: {
                    owner: { id: null, ref: null, title: null },
                    month: null,
                    quoteCurrency: null,
                    vesting: [],
                    ftes: null,
                    accounts: [
                        {
                            address: '0x123',
                            lineItems: [],
                            name: ''
                        }
                    ],
                    auditReports: [],
                    comments: []
                }
            }
        });
    });

    it('should return ReadDriveNotFoundError if read drive ID is not found', async ({
        expect
    }) => {
        const readMode = new ReadModeStorage(getDocumentModel);
        const getResult = await readMode.getReadDrive('non-existent-drive-id');
        expect(getResult).toStrictEqual(
            new ReadDriveNotFoundError('non-existent-drive-id')
        );

        const fetchResult = await readMode.fetchDriveState(
            'non-existent-drive-id'
        );
        expect(fetchResult).toStrictEqual(
            new ReadDriveNotFoundError('non-existent-drive-id')
        );

        const contextResult = await readMode.getReadDriveContext(
            'non-existent-drive-id'
        );
        expect(contextResult).toStrictEqual(
            new ReadDriveNotFoundError('non-existent-drive-id')
        );
    });

    it('should return ReadDriveSlugNotFoundError if read drive slug is not found', async ({
        expect
    }) => {
        const readMode = new ReadModeStorage(getDocumentModel);
        const result = await readMode.getReadDriveBySlug(
            'non-existent-drive-slug'
        );
        expect(result).toStrictEqual(
            new ReadDriveSlugNotFoundError('non-existent-drive-slug')
        );
    });

    it('should return ReadDocumentNotFoundError when document is not found in read drive', async ({
        expect
    }) => {
        const readModeStorage = new ReadModeStorage(getDocumentModel);
        const readDriveId = 'read-drive';
        const context: ReadDriveContext = {
            url: `https://switchboard.com/d/${readDriveId}`,
            filter: {
                branch: ['*'],
                documentId: ['*'],
                documentType: ['*'],
                scope: ['*']
            }
        };
        const driveData = {
            id: readDriveId,
            name: 'Read drive',
            documentType: '',
            created: '',
            lastModified: '',
            state: {
                icon: null,
                id: readDriveId,
                name: 'Read drive',
                nodes: [],
                slug: 'read-drive'
            }
        };

        fetchMocker.mockOnceIf(context.url, () => ({
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                data: {
                    document: driveData
                }
            })
        }));

        await readModeStorage.addReadDrive(readDriveId, context);

        fetchMocker.mockOnceIf(context.url, () => ({
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                data: {
                    errors: [
                        {
                            message:
                                'Document with id non-existent-document-id not found'
                        }
                    ],
                    document: null
                }
            })
        }));
        const result = await readModeStorage.fetchDocumentState(
            readDriveId,
            'non-existent-document-id'
        );
        expect(result).toStrictEqual(
            new ReadDocumentNotFoundError(
                readDriveId,
                'non-existent-document-id'
            )
        );

        fetchMocker.mockOnceIf(context.url, () => ({
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                data: {
                    errors: [
                        {
                            message: `Drive with id ${readDriveId} not found`
                        }
                    ],
                    document: null
                }
            })
        }));

        const result2 = await readModeStorage.fetchDocumentState(
            readDriveId,
            'non-existent-document-id'
        );
        expect(result2).toStrictEqual(new ReadDriveNotFoundError(readDriveId));
    });

    it('should throw Error when trying to add non existent drive', async ({
        expect
    }) => {
        const readModeStorage = new ReadModeStorage(getDocumentModel);
        const readDriveId = 'non-existent-drive-id';
        const context: ReadDriveContext = {
            url: `https://switchboard.com/d/${readDriveId}`,
            filter: {
                branch: ['*'],
                documentId: ['*'],
                documentType: ['*'],
                scope: ['*']
            }
        };

        fetchMocker.mockOnceIf(context.url, () => ({
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                data: {
                    document: null,
                    errors: [
                        {
                            message: `Drive with ${readDriveId} not found at ${context.url}`
                        }
                    ]
                }
            })
        }));

        await expect(
            readModeStorage.addReadDrive(readDriveId, context)
        ).rejects.toThrowError(
            `Drive with ${readDriveId} not found at ${context.url}`
        );
    });

    it('should throw if specific Graphql error is found', async ({
        expect
    }) => {
        const readModeStorage = new ReadModeStorage(getDocumentModel);
        const readDriveId = 'read-drive';
        const context: ReadDriveContext = {
            url: `https://switchboard.com/d/${readDriveId}`,
            filter: {
                branch: ['*'],
                documentId: ['*'],
                documentType: ['*'],
                scope: ['*']
            }
        };
        const driveData = {
            id: readDriveId,
            name: 'Read drive',
            documentType: '',
            created: '',
            lastModified: '',
            state: {
                icon: null,
                id: readDriveId,
                name: 'Read drive',
                nodes: [],
                slug: 'read-drive'
            }
        };

        fetchMocker.mockIf(context.url, () => ({
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                data: {
                    document: driveData
                }
            })
        }));

        await readModeStorage.addReadDrive(readDriveId, context);

        fetchMocker.mockOnceIf(context.url, () => ({
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                data: {
                    document: null,
                    errors: [
                        {
                            message:
                                'Cannot query field "revisio" on type "IDocument". Did you mean "revision"?'
                        }
                    ]
                }
            })
        }));

        await expect(
            readModeStorage.fetchDocumentState(readDriveId, 'document-id')
        ).rejects.toThrowError(
            'Cannot query field "revisio" on type "IDocument". Did you mean "revision"?'
        );
    });

    it('should throw ReadDriveNotFoundError if no document is returned', async ({
        expect
    }) => {
        const readModeStorage = new ReadModeStorage(getDocumentModel);
        const readDriveId = 'read-drive';
        const context: ReadDriveContext = {
            url: `https://switchboard.com/d/${readDriveId}`,
            filter: {
                branch: ['*'],
                documentId: ['*'],
                documentType: ['*'],
                scope: ['*']
            }
        };

        fetchMocker.mockIf(context.url, () => ({
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                data: {
                    document: null
                }
            })
        }));

        await expect(
            readModeStorage.addReadDrive(readDriveId, context)
        ).rejects.toThrowError(
            `Drive "${readDriveId}" not found at ${context.url}`
        );
    });

    it('should return ReadDocumentNotFoundError if no document is returned', async ({
        expect
    }) => {
        const readModeStorage = new ReadModeStorage(getDocumentModel);
        const readDriveId = 'read-drive';
        const context: ReadDriveContext = {
            url: `https://switchboard.com/d/${readDriveId}`,
            filter: {
                branch: ['*'],
                documentId: ['*'],
                documentType: ['*'],
                scope: ['*']
            }
        };
        const driveData = {
            id: readDriveId,
            name: 'Read drive',
            documentType: '',
            created: '',
            lastModified: '',
            state: {
                icon: null,
                id: readDriveId,
                name: 'Read drive',
                nodes: [],
                slug: 'read-drive'
            }
        };

        fetchMocker.mockIf(context.url, () => ({
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                data: {
                    document: driveData
                }
            })
        }));

        await readModeStorage.addReadDrive(readDriveId, context);

        fetchMocker.mockOnceIf(context.url, () => ({
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                data: {
                    document: null
                }
            })
        }));

        const result = await readModeStorage.fetchDocumentState(
            readDriveId,
            'document-id'
        );

        expect(result).toStrictEqual(
            new ReadDocumentNotFoundError(readDriveId, 'document-id')
        );
    });
});
