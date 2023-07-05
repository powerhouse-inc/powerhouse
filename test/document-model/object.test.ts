import fs from 'fs';
import {
    DocumentModel,
    reducer,
} from '../../src/document-model';
import { loadFromInput } from '../../src/document/utils/file';

describe('DocumentModel Class', () => {
    /*
    afterAll(() => {
        fs.rmSync('./test/budget-statement/temp/march.phbs.zip');
    });
    */

    it('should set initial state', async () => {
        const model = new DocumentModel();

        expect(model.name).toBe('');
        expect(model.documentType).toBe('powerhouse/document-model');
        expect(model.operations.length).toBe(0);

        model.setModelExtension({ extension: 'phdm' });
        expect(model.state.extension).toBe('phdm');

        model
            .addModule({ name: 'state' })
            .addModule({ name: 'header' });

        expect(model.state.modules.map(m => m.name)).toStrictEqual(['state', 'header']);

        model.reorderModules({order:[
            model.state.modules[1].id,
            model.state.modules[0].id,
        ]});

        expect(model.state.modules.map(m => m.name)).toStrictEqual(['header', 'state']);
    });
});
