import { DocumentModel } from '../../src/document-model';

describe('DocumentModel Class', () => {
    it('should create an empty document', () => {
        const model = new DocumentModel();

        expect(model.name).toBe('');
        expect(model.documentType).toBe('powerhouse/document-model');
        expect(model.revision).toBe(0);
        expect(model.operations.length).toBe(0);

        expect(model.state.id).toBe('');
        expect(model.state.name).toBe('');
        expect(model.state.description).toBe('');
        expect(model.state.extension).toBe('');
        expect(model.state.specifications.length).toBe(1);
        expect(model.state.specifications[0].version).toBe(1);
        expect(model.state.specifications[0].changeLog.length).toBe(0);
        expect(model.state.specifications[0].modules.length).toBe(0);
        expect(model.state.author).toEqual({
            name: '',
            website: '',
        });
    });

    it('should apply basic operations', () => {
        const model = new DocumentModel();

        model
            .setModelId({ id: '<id>' })
            .setModelName({ name: '<name>' })
            .setModelDescription({ description: '<description>' })
            .setModelExtension({ extension: 'phdm' })
            .setAuthorName({ authorName: '<authorName>' })
            .setAuthorWebsite({ authorWebsite: '<authorWebsite>' });

        expect(model.state.id).toBe('<id>');
        expect(model.state.name).toBe('<name>');
        expect(model.state.description).toBe('<description>');
        expect(model.state.extension).toBe('phdm');
        expect(model.state.author).toEqual({
            name: '<authorName>',
            website: '<authorWebsite>',
        });
    });

    it('should apply module operations to the latest specification', () => {
        const model = new DocumentModel();

        model.addModule({ name: 'state' }).addModule({ name: 'header' });

        expect(
            model.state.specifications[0].modules.map(m => m.name)
        ).toStrictEqual(['state', 'header']);

        expect(model.state.specifications[0].modules[0].id).toMatch(
            /^[a-zA-Z0-9+\\/]{27}=$/
        );
        expect(model.state.specifications[0].modules[0].name).toBe('state');
        expect(model.state.specifications[0].modules[0].description).toBe('');
        expect(model.state.specifications[0].modules[0].operations.length).toBe(
            0
        );

        model.reorderModules({
            order: [
                model.state.specifications[0].modules[1].id,
                model.state.specifications[0].modules[0].id,
            ],
        });

        expect(
            model.state.specifications[0].modules.map(m => m.name)
        ).toStrictEqual(['header', 'state']);

        const headerModuleId = model.state.specifications[0].modules[0].id;
        const stateModuleId = model.state.specifications[0].modules[1].id;

        model.setModuleName({ id: headerModuleId, name: 'Header' });
        model.setModuleDescription({
            id: headerModuleId,
            description: '<header description>',
        });
        model.deleteModule({ id: stateModuleId });

        expect(model.state.specifications[0].modules).toStrictEqual([
            {
                id: headerModuleId,
                name: 'Header',
                description: '<header description>',
                operations: [],
            },
        ]);
    });

    it('should apply operations operations to the latest spec', () => {
        const model = new DocumentModel();

        model.addModule({ name: 'header' }).addModule({ name: 'state' });

        const headerModuleId = model.state.specifications[0].modules[0].id;
        const stateModuleId = model.state.specifications[0].modules[1].id;

        model.addOperation({
            moduleId: headerModuleId,
            name: 'SetModuleExtension',
            schema: '<SetModuleExtension.schema>',
            description: '<SetModuleExtension.description>',
            template: '<SetModuleExtension.template>',
            reducer: '<SetModuleExtension.reducer>',
        });

        model.addOperation({
            moduleId: stateModuleId,
            name: 'AddStateExample',
        });

        const setModuleExtensionId =
            model.state.specifications[0].modules[0].operations[0].id;
        const addStateExampleId =
            model.state.specifications[0].modules[1].operations[0].id;

        expect(model.state.specifications[0].modules[0]).toEqual({
            id: headerModuleId,
            name: 'header',
            description: '',
            operations: [
                {
                    id: setModuleExtensionId,
                    name: 'SetModuleExtension',
                    schema: '<SetModuleExtension.schema>',
                    description: '<SetModuleExtension.description>',
                    template: '<SetModuleExtension.template>',
                    reducer: '<SetModuleExtension.reducer>',
                    examples: [],
                    errors: [],
                },
            ],
        });

        expect(model.state.specifications[0].modules[1]).toEqual({
            id: stateModuleId,
            name: 'state',
            description: '',
            operations: [
                {
                    id: addStateExampleId,
                    name: 'AddStateExample',
                    schema: '',
                    description: '',
                    template: '',
                    reducer: '',
                    examples: [],
                    errors: [],
                },
            ],
        });

        model.moveOperation({
            operationId: setModuleExtensionId,
            newModuleId: stateModuleId,
        });

        expect(model.state.specifications[0].modules[0]).toEqual({
            id: headerModuleId,
            name: 'header',
            description: '',
            operations: [],
        });

        expect(model.state.specifications[0].modules[1]).toEqual({
            id: stateModuleId,
            name: 'state',
            description: '',
            operations: [
                {
                    id: addStateExampleId,
                    name: 'AddStateExample',
                    schema: '',
                    description: '',
                    template: '',
                    reducer: '',
                    examples: [],
                    errors: [],
                },
                {
                    id: setModuleExtensionId,
                    name: 'SetModuleExtension',
                    schema: '<SetModuleExtension.schema>',
                    description: '<SetModuleExtension.description>',
                    template: '<SetModuleExtension.template>',
                    reducer: '<SetModuleExtension.reducer>',
                    examples: [],
                    errors: [],
                },
            ],
        });

        model.reorderModuleOperations({
            moduleId: stateModuleId,
            order: [setModuleExtensionId, addStateExampleId],
        });

        expect(model.state.specifications[0].modules[1].operations).toEqual([
            {
                id: setModuleExtensionId,
                name: 'SetModuleExtension',
                schema: '<SetModuleExtension.schema>',
                description: '<SetModuleExtension.description>',
                template: '<SetModuleExtension.template>',
                reducer: '<SetModuleExtension.reducer>',
                examples: [],
                errors: [],
            },
            {
                id: addStateExampleId,
                name: 'AddStateExample',
                schema: '',
                description: '',
                template: '',
                reducer: '',
                examples: [],
                errors: [],
            },
        ]);

        model.setOperationName({
            id: addStateExampleId,
            name: 'SetAuthorName',
        });
        model.setOperationSchema({
            id: addStateExampleId,
            schema: '<SetAuthorName.schema>',
        });
        model.setOperationDescription({
            id: addStateExampleId,
            description: '<SetAuthorName.description>',
        });
        model.setOperationReducer({
            id: addStateExampleId,
            reducer: '<SetAuthorName.reducer>',
        });
        model.setOperationTemplate({
            id: addStateExampleId,
            template: '<SetAuthorName.template>',
        });

        const updatedValue = {
            id: addStateExampleId,
            name: 'SetAuthorName',
            schema: '<SetAuthorName.schema>',
            description: '<SetAuthorName.description>',
            template: '<SetAuthorName.template>',
            reducer: '<SetAuthorName.reducer>',
            examples: [],
            errors: [],
        };

        expect(model.state.specifications[0].modules[1].operations[1]).toEqual(
            updatedValue
        );

        model.deleteOperation({ id: setModuleExtensionId });
        expect(model.state.specifications[0].modules[1].operations.length).toBe(
            1
        );
        expect(model.state.specifications[0].modules[1].operations[0]).toEqual(
            updatedValue
        );
    });
});
