import fs from 'fs';
import { actions, reducer, utils } from '../../src/document-model';
import { actions as baseActions } from '../../src/document';

describe('DocumentModel Class', () => {
    const tempDir = './test/document/temp/document-model/zip';
    let timestamp = '';
    beforeAll(() => {
        if (!fs.existsSync(tempDir))
            fs.mkdirSync(tempDir, {
                recursive: true,
            });
    });

    afterAll(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should save to zip', async () => {
        let documentModel = utils.createDocument();
        documentModel = reducer(
            documentModel,
            actions.setModelId({ id: 'powerhouse/test' }),
        );
        await utils.saveToFile(documentModel, tempDir, 'test');
        expect(fs.existsSync(`${tempDir}/test.phdm.zip`)).toBe(true);

        // keeps operation timestamp to check when loading
        timestamp = documentModel.operations.global[0].timestamp;
    });

    it('should load from zip', async () => {
        const documentModel = await utils.loadFromFile(
            `${tempDir}/test.phdm.zip`,
        );
        expect(documentModel.state.global.id).toBe('powerhouse/test');
        expect(documentModel.operations.global).toStrictEqual([
            {
                hash: 'xmstBdekoMQJQXwUZaOcv/Q/d9Q=',
                index: 0,
                input: { id: 'powerhouse/test' },
                scope: 'global',
                type: 'SET_MODEL_ID',
                timestamp,
            },
        ]);
    });

    it('should keep undo state when loading from zip', async () => {
        let documentModel = utils.createDocument();
        documentModel = reducer(
            documentModel,
            actions.setModelId({ id: 'powerhouse/test' }),
        );
        documentModel = reducer(documentModel, baseActions.undo());
        expect(documentModel.state.global.id).toBe('');

        const timestamp = documentModel.operations.global[0].timestamp;
        await utils.saveToFile(documentModel, tempDir, 'test2');

        const loadedDocumentModel = await utils.loadFromFile(
            `${tempDir}/test2.phdm.zip`,
        );
        expect(loadedDocumentModel.state.global.id).toBe('');
        expect(loadedDocumentModel.operations.global).toStrictEqual([
            {
                hash: 'xmstBdekoMQJQXwUZaOcv/Q/d9Q=',
                index: 0,
                input: { id: 'powerhouse/test' },
                scope: 'global',
                type: 'SET_MODEL_ID',
                timestamp,
            },
        ]);

        expect(loadedDocumentModel).toStrictEqual(documentModel);
    });
});
