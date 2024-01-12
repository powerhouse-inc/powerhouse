import { DocumentModel } from '../../src/document-model';
// import { hashKey } from '../../src/document/utils';

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
                .setModelId({ id: '<id>' }, 1)
                .setModelName({ name: '<name>' }, 2)
                .setModelDescription({ description: '<description>' }, 3)
                .setModelExtension({ extension: 'phdm' }, 4)
                .setAuthorName({ authorName: '<authorName>' }, 5)
                .setAuthorWebsite({ authorWebsite: '<authorWebsite>' }, 6);

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
                .addModule({ id: '<id>', name: '<name>', description: '<description>' }, 1)
                .setModelName({ name: '<name>' }, 2)
                .setModuleDescription({ id: '<id>', description: '<description>' }, 3)
                .reorderModules({ order: ['<id>']  }, 4)
                .deleteModule({ id: '<id>' }, 5);

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
                .addOperationError({ id: '<id>', operationId: '<operationId>' }, 1)
                .setOperationErrorCode({ id: '<id>', errorCode: '<errorCode>' }, 2)
                .setOperationErrorName({ id: '<id>', errorName: '<errorName>' }, 3)
                .setOperationErrorDescription({ id: '<id>', errorDescription: '<errorDescription>' }, 4)
                .setOperationErrorTemplate({ id: '<id>', errorTemplate: '<errorTemplate>' }, 5)
                .reorderOperationErrors({ operationId: '<operationId>', order: ['<id>'] }, 6)
                .deleteOperationError({ id: '<id>' }, 7);

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
                .addOperationExample({ id: '<id>', operationId: '<operationId>', example: '<example>' }, 1)
                .updateOperationExample({ id: '<id>', example: '<example>' }, 2)
                .reorderOperationExamples({ operationId: '<operationId>', order: ['<id>'] }, 3)
                .deleteOperationExample({ id: '<id>' }, 4);

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
                .addOperation({ id: '<id>', name: '<name>', moduleId: '<moduleId>' }, 1)
                .setOperationName({ id: '<id>', name: '<name>' }, 2)
                .setOperationScope({ id: '<id>', scope: 'global' }, 3)
                .setOperationSchema({ id: '<id>', schema: '<schema>' }, 4)
                .setOperationDescription({ id: '<id>', description: '<description>' }, 5)
                .setOperationTemplate({ id: '<id>', template: '<template>' }, 6)
                .setOperationReducer({ id: '<id>', reducer: '<reducer>' }, 7)
                .moveOperation({ newModuleId: '<newModuleId>', operationId: '<operationId>' }, 8)
                .reorderModuleOperations({ moduleId: '<moduleId>', order: ['<id>'] }, 9)
                .deleteOperation({ id: '<id>' }, 10);
            
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
                .setStateSchema({ schema: '<schema>', scope: 'global' }, 1)
                .setInitialState({ initialValue: '<initialValue>', scope: 'global' }, 2)
                .addStateExample({ id: '<id>', example: '<example>', scope: 'global' }, 3)
                .updateStateExample({ id: '<id>', newExample: '<newExample>', scope: 'global' }, 4)
                .reorderStateExamples({ order: ['<id>'], scope: 'global' }, 5)
                .deleteStateExample({ id: '<id>', scope: 'global' }, 6);

            expect(model.revision).toBe(6);
            model.operations.global.forEach((op, index) => {
                expect(op).toHaveProperty('skip', index + 1);
            });
        });
    });
});
