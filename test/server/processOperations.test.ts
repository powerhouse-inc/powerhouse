import * as DocumentDrive from 'document-model-libs/document-drive';
import * as DocumentModelsLibs from 'document-model-libs/document-models';
import {
    Action,
    DocumentModel as BaseDocumentModel,
    Operation
} from 'document-model/document';
import {
    DocumentModelDocument,
    module as DocumentModelLib,
    actions,
    reducer
} from 'document-model/document-model';
import { beforeEach, describe, expect, it } from 'vitest';
import { DocumentDriveServer } from '../../src';
import { OperationError } from '../../src/server/error';
import { garbageCollect } from '../../src/utils/document-helpers';
import { buildOperation, buildOperations } from '../utils';

const mapExpectedOperations = (operations: Operation[]) =>
    operations.map(op => {
        const { timestamp, ...operation } = op;
        return operation;
    });

describe('processOperations', () => {
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
    const documentId = '1';

    async function buildFile(initialOperations: Action[] = []) {
        await server.addDrive({
            global: { id: driveId, name: 'test', icon: null, slug: null },
            local: {
                availableOffline: false,
                sharingType: 'PRIVATE',
                listeners: [],
                triggers: []
            }
        });
        const drive = await server.getDrive(driveId);
        await server.addDriveOperation(
            driveId,
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

        let document = (await server.getDocument(
            driveId,
            documentId
        )) as DocumentModelDocument;

        if (initialOperations.length > 0) {
            await server.addOperations(
                driveId,
                documentId,
                buildOperations(reducer, document, initialOperations)
            );

            document = (await server.getDocument(
                driveId,
                documentId
            )) as DocumentModelDocument;
        }

        return document;
    }

    it('should add initial operations to a document', async () => {
        const operations = [
            actions.setModelName({ name: 'test' }),
            actions.setModelId({ id: 'test' })
        ];

        const document = await buildFile(operations);

        expect(document.operations.global.length).toBe(operations.length);
        expect(document.state.global).toMatchObject({
            name: 'test',
            id: 'test'
        });
    });

    it('should apply a single new operation', async () => {
        const document = await buildFile();

        const operations = buildOperations(reducer, document, [
            actions.setModelName({ name: 'test' })
        ]);

        const result = await server._processOperations(
            driveId,
            document,
            operations
        );

        expect(result.document.state.global).toMatchObject({ name: 'test' });
        expect(result.error).toBeUndefined();
        expect(result.operationsUpdated.length).toBe(0);
        expect(result.operationsApplied.length).toBe(1);
        expect(result.operationsApplied).toMatchObject(
            mapExpectedOperations(operations)
        );
    });

    it('should apply multiple new operations', async () => {
        const document = await buildFile([
            actions.setModelName({ name: 'test' }),
            actions.setModelId({ id: 'test' })
        ]);

        const operations = buildOperations(reducer, document, [
            actions.setModelName({ name: 'test2' }),
            actions.setModelId({ id: 'test2' }),
            actions.setModelExtension({
                extension: 'test2'
            })
        ]);

        const result = await server._processOperations(
            driveId,
            document,
            operations
        );

        expect(result.document.state.global).toMatchObject({
            name: 'test2',
            id: 'test2',
            extension: 'test2'
        });
        expect(result.error).toBeUndefined();
        expect(result.operationsUpdated.length).toBe(0);
        expect(result.operationsApplied.length).toBe(operations.length);
        expect(result.operationsApplied).toMatchObject(
            mapExpectedOperations(operations)
        );
    });

    it('should apply undo operation', async () => {
        const document = await buildFile([
            actions.setModelName({ name: 'test' }),
            actions.setModelId({ id: 'test' })
        ]);

        const operations = buildOperations(reducer, document, [actions.undo()]);

        const result = await server._processOperations(
            driveId,
            document,
            operations
        );

        expect(result.document.state.global).toMatchObject({
            name: 'test',
            id: ''
        });
        expect(result.error).toBeUndefined();
        expect(result.operationsUpdated.length).toBe(0);
        expect(result.operationsApplied.length).toBe(operations.length);
        expect(result.operationsApplied).toMatchObject(
            mapExpectedOperations(operations)
        );

        expect(result.document.operations.global.length).toBe(3);
        expect(result.document.operations.global[1]).toMatchObject({
            type: 'NOOP',
            skip: 0
        });
        expect(result.document.operations.global[2]).toMatchObject({
            type: 'NOOP',
            skip: 1
        });
    });

    it('should update an undo operation', async () => {
        const document = await buildFile([
            actions.setModelName({ name: 'test' }),
            actions.setModelId({ id: 'test' }),
            actions.setModelExtension({ extension: 'test' }),
            actions.undo()
        ]);

        const operations = buildOperations(reducer, document, [actions.undo()]);

        const result = await server._processOperations(
            driveId,
            document,
            operations
        );

        expect(result.document.state.global).toMatchObject({
            name: 'test',
            id: '',
            extension: ''
        });
        expect(result.error).toBeUndefined();
        expect(result.operationsUpdated.length).toBe(1);
        expect(result.operationsUpdated).toMatchObject([
            {
                index: 3,
                type: 'NOOP',
                skip: 2
            }
        ]);
        expect(result.operationsApplied.length).toBe(0);
        expect(garbageCollect(result.document.operations.global)).toMatchObject(
            garbageCollect([
                { type: 'SET_MODEL_NAME', index: 0, skip: 0 },
                { type: 'NOOP', index: 1, skip: 0 },
                { type: 'NOOP', index: 2, skip: 0 },
                { type: 'NOOP', index: 3, skip: 2 }
            ] as Operation[])
        );
    });

    it('should throw an error if there is a missing index operation', async () => {
        const document = await buildFile([
            actions.setModelName({ name: 'test' }),
            actions.setModelId({ id: 'test' }),
            actions.setModelExtension({ extension: 'test' })
        ]);

        const operations = [
            buildOperation(
                reducer,
                document,
                actions.setModelName({ name: 'test2' }),
                4
            )
        ];

        const result = await server._processOperations(
            driveId,
            document,
            operations
        );

        expect(result.error).toBeInstanceOf(OperationError);
        expect(result.error?.message).toBe(
            'Missing operations: expected 3 with skip 0 or equivalent, got index 4 with skip 0'
        );
        expect(result.operationsUpdated.length).toBe(0);
        expect(result.operationsApplied.length).toBe(0);
        expect(result.document.operations.global.length).toBe(3);
        expect(result.document.state.global).toMatchObject({
            name: 'test',
            id: 'test',
            extension: 'test'
        });
    });

    it('should throw an error if there is a missing index operation between valid operations', async () => {
        const document = await buildFile([
            actions.setModelName({ name: 'test' }),
            actions.setModelId({ id: 'test' }),
            actions.setModelExtension({ extension: 'test' })
        ]);

        const operations = [
            buildOperation(
                reducer,
                document,
                actions.setModelName({ name: 'test3' }),
                3
            ),
            buildOperation(
                reducer,
                document,
                actions.setModelName({ name: 'test4' }),
                4
            ),
            buildOperation(
                reducer,
                document,
                actions.setModelName({ name: 'test6' }),
                6
            ),
            buildOperation(
                reducer,
                document,
                actions.setModelName({ name: 'test7' }),
                7
            )
        ];

        const result = await server._processOperations(
            driveId,
            document,
            operations
        );

        expect(result.error).toBeInstanceOf(OperationError);
        expect(result.error?.message).toBe(
            'Missing operations: expected 5 with skip 0 or equivalent, got index 6 with skip 0'
        );
        expect(result.operationsUpdated.length).toBe(0);
        expect(result.operationsApplied.length).toBe(2);
        expect(result.document.operations.global.length).toBe(5);
        expect(result.document.state.global).toMatchObject({
            name: 'test4',
            id: 'test',
            extension: 'test'
        });
    });

    it('should throw an error if there is a duplicated index operation', async () => {
        const document = await buildFile([
            actions.setModelName({ name: 'test' }),
            actions.setModelId({ id: 'test' }),
            actions.setModelExtension({ extension: 'test' })
        ]);

        const operations = [
            buildOperation(
                reducer,
                document,
                actions.setModelName({ name: 'test2' }),
                2
            )
        ];

        const result = await server._processOperations(
            driveId,
            document,
            operations
        );

        expect(result.error).toBeUndefined();
        expect(result.operationsUpdated.length).toBe(0);
        expect(result.operationsApplied.length).toBe(2);
        expect(result.document.operations.global.length).toBe(5);
        expect(result.document.state.global).toMatchObject({
            name: 'test2',
            id: 'test',
            extension: 'test'
        });
    });

    it('should throw an error if there is a duplicated index operation between valid operations', async () => {
        const document = await buildFile([
            actions.setModelName({ name: 'test' }),
            actions.setModelId({ id: 'test' }),
            actions.setModelExtension({ extension: 'test' })
        ]);

        const operations = [
            buildOperation(
                reducer,
                document,
                actions.setModelName({ name: 'test3' }),
                3
            ),
            buildOperation(
                reducer,
                document,
                actions.setModelName({ name: 'test4' }),
                3
            ),
            buildOperation(
                reducer,
                document,
                actions.setModelName({ name: 'test5' }),
                4
            )
        ];

        const result = await server._processOperations(
            driveId,
            document,
            operations
        );

        expect(result.error).toBeUndefined();
        expect(result.operationsUpdated.length).toBe(0);
        expect(result.operationsApplied.length).toBe(2);
        expect(result.document.operations.global.length).toBe(5);
        expect(result.document.state.global).toMatchObject({
            name: 'test5',
            id: 'test',
            extension: 'test'
        });
    });

    it('should not re-apply existing operations', async () => {
        let document = await buildFile();

        const operation = buildOperation(
            reducer,
            document,
            actions.setModelName({ name: 'test' })
        );

        const resultOp1 = await server.addOperation(
            driveId,
            documentId,
            operation
        );

        expect(resultOp1.status).toBe('SUCCESS');

        document = (await server.getDocument(
            driveId,
            documentId
        )) as DocumentModelDocument;

        expect(document.state.global.name).toBe('test');
        expect(document.operations.global.length).toBe(1);
        expect(document.operations.global).toMatchObject([
            {
                hash: operation.hash,
                index: operation.index,
                input: operation.input,
                scope: operation.scope,
                skip: operation.skip
            }
        ]);

        const resultOp2 = await server.addOperation(
            driveId,
            documentId,
            operation
        );

        document = (await server.getDocument(
            driveId,
            documentId
        )) as DocumentModelDocument;

        expect(resultOp2.status).toBe('SUCCESS');
        expect(resultOp2.operations.length).toBe(0);

        expect(document.operations.global.length).toBe(1);
        expect(document.operations.global).toMatchObject([
            {
                hash: operation.hash,
                index: operation.index,
                input: operation.input,
                scope: operation.scope,
                skip: operation.skip
            }
        ]);
    });
});
