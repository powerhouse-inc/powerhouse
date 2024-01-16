import {
    reducer,
    DocumentModel,
    DocumentModelState,
    DocumentModelAction,
    DocumentModelLocalState,
    utils as documentModelUtils,
} from '../../src/document-model';
import { utils } from '../../src/document';
import { createDocument } from '../../src/document/utils';
import {
    setAuthorName,
    setAuthorWebsite,
    setModelDescription,
    setModelExtension,
    setModelId,
    setModelName,
} from '../../src/document-model/gen/creators';
import { stateReducer } from '../../src/document-model/gen/reducer';

describe('DocumentModel Class', () => {
    describe('Skip header operations', () => {
        it('should include skip param in base operations with default value to 0 if not provided', () => {
            const model = new DocumentModel();
    
            model
                .setModelId({ id: '<id>' })
                .setModelName({ name: '<name>' })
                .setModelDescription({ description: '<description>' })
                .setModelExtension({ extension: 'phdm' })
                .setAuthorName({ authorName: '<authorName>' })
                .setAuthorWebsite({ authorWebsite: '<authorWebsite>' });
    
    
            expect(model.revision).toBe(6);
            model.operations.global.forEach((op) => {
                expect(op).toHaveProperty('skip', 0);
            });
        });

        it('should include skip param in base operations with provided value', () => {
            const model = new DocumentModel();

            model
                .setModelId({ id: '<id>' }, { skip: 1 })
                .setModelName({ name: '<name>' }, { skip: 2 })
                .setModelDescription({ description: '<description>' }, { skip: 3 })
                .setModelExtension({ extension: 'phdm' }, { skip: 4 })
                .setAuthorName({ authorName: '<authorName>' }, { skip: 5 })
                .setAuthorWebsite({ authorWebsite: '<authorWebsite>' }, { skip: 6 });

            expect(model.revision).toBe(6);
            model.operations.global.forEach((op, index) => {
                expect(op).toHaveProperty('skip', index + 1);
            });
        });
    });


    describe('Skip module operations', () => {
        it('should include skip param in module operations with default value to 0 if not provided', () => {
            const model = new DocumentModel();
    
            model
                .addModule({ id: '<id>', name: '<name>', description: '<description>' })
                .setModelName({ name: '<name>' })
                .setModuleDescription({ id: '<id>', description: '<description>' })
                .reorderModules({ order: ['<id>']  })
                .deleteModule({ id: '<id>' });
    
    
            expect(model.revision).toBe(5);
            model.operations.global.forEach((op) => {
                expect(op).toHaveProperty('skip', 0);
            });
        });

        it('should include skip param in module operations with provided value', () => {
            const model = new DocumentModel();

            model
                .addModule({ id: '<id>', name: '<name>', description: '<description>' }, { skip: 1 })
                .setModelName({ name: '<name>' }, { skip: 2 })
                .setModuleDescription({ id: '<id>', description: '<description>' }, { skip: 3 })
                .reorderModules({ order: ['<id>']  }, { skip: 4 })
                .deleteModule({ id: '<id>' }, { skip: 5 });

            expect(model.revision).toBe(5);
            model.operations.global.forEach((op, index) => {
                expect(op).toHaveProperty('skip', index + 1);
            });
        });
    });

    describe('Skip operation-error operations', () => {
        it('should include skip param in operation-error operations with default value to 0 if not provided', () => {
            const model = new DocumentModel();
    
            model
                .addOperationError({ id: '<id>', operationId: '<operationId>' })
                .setOperationErrorCode({ id: '<id>', errorCode: '<errorCode>' })
                .setOperationErrorName({ id: '<id>', errorName: '<errorName>' })
                .setOperationErrorDescription({ id: '<id>', errorDescription: '<errorDescription>' })
                .setOperationErrorTemplate({ id: '<id>', errorTemplate: '<errorTemplate>' })
                .reorderOperationErrors({ operationId: '<operationId>', order: ['<id>'] })
                .deleteOperationError({ id: '<id>' });
    
    
            expect(model.revision).toBe(7);
            model.operations.global.forEach((op) => {
                expect(op).toHaveProperty('skip', 0);
            });
        });

        it('should include skip param in operation-error operations with provided value', () => {
            const model = new DocumentModel();

            model
                .addOperationError({ id: '<id>', operationId: '<operationId>' }, { skip: 1 })
                .setOperationErrorCode({ id: '<id>', errorCode: '<errorCode>' }, { skip: 2 })
                .setOperationErrorName({ id: '<id>', errorName: '<errorName>' }, { skip: 3 })
                .setOperationErrorDescription({ id: '<id>', errorDescription: '<errorDescription>' }, { skip: 4 })
                .setOperationErrorTemplate({ id: '<id>', errorTemplate: '<errorTemplate>' }, { skip: 5 })
                .reorderOperationErrors({ operationId: '<operationId>', order: ['<id>'] }, { skip: 6 })
                .deleteOperationError({ id: '<id>' }, { skip: 7 });

            expect(model.revision).toBe(7);
            model.operations.global.forEach((op, index) => {
                expect(op).toHaveProperty('skip', index + 1);
            });
        });
    });

    describe('Skip operation-example operations', () => {
        it('should include skip param in operation-example operations with default value to 0 if not provided', () => {
            const model = new DocumentModel();
    
            model
                .addOperationExample({ id: '<id>', operationId: '<operationId>', example: '<example>' })
                .updateOperationExample({ id: '<id>', example: '<example>' })
                .reorderOperationExamples({ operationId: '<operationId>', order: ['<id>'] })
                .deleteOperationExample({ id: '<id>' });
    
    
            expect(model.revision).toBe(4);
            model.operations.global.forEach((op) => {
                expect(op).toHaveProperty('skip', 0);
            });
        });

        it('should include skip param in operation-example operations with provided value', () => {
            const model = new DocumentModel();

            model
                .addOperationExample({ id: '<id>', operationId: '<operationId>', example: '<example>' }, { skip: 1 })
                .updateOperationExample({ id: '<id>', example: '<example>' }, { skip: 2 })
                .reorderOperationExamples({ operationId: '<operationId>', order: ['<id>'] }, { skip: 3 })
                .deleteOperationExample({ id: '<id>' }, { skip: 4 });

            expect(model.revision).toBe(4);
            model.operations.global.forEach((op, index) => {
                expect(op).toHaveProperty('skip', index + 1);
            });
        });
    });

    describe('Skip operation operations', () => {
        it('should include skip param in operation operations with default value to 0 if not provided', () => {
            const model = new DocumentModel();
    
            model
                .addOperation({ id: '<id>', name: '<name>', moduleId: '<moduleId>' })
                .setOperationName({ id: '<id>', name: '<name>' })
                .setOperationScope({ id: '<id>', scope: 'global' })
                .setOperationSchema({ id: '<id>', schema: '<schema>' })
                .setOperationDescription({ id: '<id>', description: '<description>' })
                .setOperationTemplate({ id: '<id>', template: '<template>' })
                .setOperationReducer({ id: '<id>', reducer: '<reducer>' })
                .moveOperation({ newModuleId: '<newModuleId>', operationId: '<operationId>' })
                .reorderModuleOperations({ moduleId: '<moduleId>', order: ['<id>'] })
                .deleteOperation({ id: '<id>' });
    
    
            expect(model.revision).toBe(10);
            model.operations.global.forEach((op) => {
                expect(op).toHaveProperty('skip', 0);
            });
        });

        it('should include skip param in operation operations with provided value', () => {
            const model = new DocumentModel();

            model
                .addOperation({ id: '<id>', name: '<name>', moduleId: '<moduleId>' }, { skip: 1 })
                .setOperationName({ id: '<id>', name: '<name>' }, { skip: 2 })
                .setOperationScope({ id: '<id>', scope: 'global' }, { skip: 3 })
                .setOperationSchema({ id: '<id>', schema: '<schema>' }, { skip: 4 })
                .setOperationDescription({ id: '<id>', description: '<description>' }, { skip: 5 })
                .setOperationTemplate({ id: '<id>', template: '<template>' }, { skip: 6 })
                .setOperationReducer({ id: '<id>', reducer: '<reducer>' }, { skip: 7 })
                .moveOperation({ newModuleId: '<newModuleId>', operationId: '<operationId>' }, { skip: 8 })
                .reorderModuleOperations({ moduleId: '<moduleId>', order: ['<id>'] }, { skip: 9 })
                .deleteOperation({ id: '<id>' }, { skip: 10 });
            
            expect(model.revision).toBe(10);
            model.operations.global.forEach((op, index) => {
                expect(op).toHaveProperty('skip', index + 1);
            });
        });
    });

    describe('Skip object operations', () => {
        it('should include skip param in object operations with default value to 0 if not provided', () => {
            const model = new DocumentModel();
    
            model
                .setStateSchema({ schema: '<schema>', scope: 'global' })
                .setInitialState({ initialValue: '<initialValue>', scope: 'global' })
                .addStateExample({ id: '<id>', example: '<example>', scope: 'global' })
                .updateStateExample({ id: '<id>', newExample: '<newExample>', scope: 'global' })
                .reorderStateExamples({ order: ['<id>'], scope: 'global' })
                .deleteStateExample({ id: '<id>', scope: 'global' });
    
    
            expect(model.revision).toBe(6);
            model.operations.global.forEach((op) => {
                expect(op).toHaveProperty('skip', 0);
            });
        });

        it('should include skip param in object operations with provided value', () => {
            const model = new DocumentModel();

            model
                .setStateSchema({ schema: '<schema>', scope: 'global' }, { skip: 1 })
                .setInitialState({ initialValue: '<initialValue>', scope: 'global' }, { skip: 2 })
                .addStateExample({ id: '<id>', example: '<example>', scope: 'global' }, { skip: 3 })
                .updateStateExample({ id: '<id>', newExample: '<newExample>', scope: 'global' }, { skip: 4 })
                .reorderStateExamples({ order: ['<id>'], scope: 'global' }, { skip: 5 })
                .deleteStateExample({ id: '<id>', scope: 'global' }, { skip: 6 });

            expect(model.revision).toBe(6);
            model.operations.global.forEach((op, index) => {
                expect(op).toHaveProperty('skip', index + 1);
            });
        });
    });


    describe('state replayOperations', () => {
        it('skipped operations should be ignored when re-calculate document state', () => {
           
            const initialState = documentModelUtils.createExtendedState();
            const document = createDocument<
                DocumentModelState,
                DocumentModelAction,
                DocumentModelLocalState
            >(initialState);

            let newDocument = reducer(
                document,
                setModelDescription({ description: '<description>' })
            );
            newDocument = reducer(newDocument, setModelName({ name: '<name>' }));
            newDocument = reducer(
                newDocument,
                setModelExtension({ extension: 'phdm' }),
                undefined,
                { skip: 2 },
            );
            newDocument = reducer(newDocument, setAuthorName({ authorName: '<authorName>' }));
            newDocument = reducer(
                newDocument,
                setAuthorWebsite({ authorWebsite: '<authorWebsite>' }),
                undefined,
                { skip: 1 },
            );
            newDocument = reducer(newDocument, setModelId({ id: '<id>' }));

            const replayedDoc = utils.replayOperations(
                initialState,
                newDocument.operations,
                stateReducer,
            );

            expect(replayedDoc.revision.global).toBe(6);
            expect(replayedDoc.operations.global.length).toBe(6);
            expect(replayedDoc.state.global).toMatchObject({
                id: '<id>',
                name: '',
                extension: 'phdm',
                description: '',
                author: { name: '', website: '<authorWebsite>' }
            })
        });
    });
});
