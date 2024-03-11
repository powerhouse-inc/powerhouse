import fs from 'fs';
import { getLocalFile, validateOperations } from '../../src/document/utils';
import { hash as hashBrowser } from '../../src/document/utils/browser';
import { hash as hashNode } from '../../src/document/utils/node';

describe('Base utils', () => {
    const tempDir = './test/document/temp/utils/';
    const tempFile = `${tempDir}report.pdf`;

    beforeAll(() => {
        if (!fs.existsSync(tempDir))
            fs.mkdirSync(tempDir, {
                recursive: true,
            });
        fs.writeFileSync(tempFile, 'TEST');
    });

    afterAll(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should parse file attributes', async () => {
        const file = await getLocalFile(tempFile);
        expect(file).toStrictEqual({
            data: 'VEVTVA==',
            hash: 'Q1pqSc2iiEdpNLjRefhjnQ3nNc8=',
            mimeType: 'application/pdf',
            extension: 'pdf',
            fileName: 'report.pdf',
        });
    });

    it("should throw exception when file doesn't exists", async () => {
        await expect(getLocalFile('as')).rejects.toBeDefined();
    });

    it('should hash in browser and node', async () => {
        expect(hashNode('test')).toEqual(hashBrowser('test'));
    });

    it('should find invalid index oprations', () => {
        const errors = validateOperations({
            global: [
                {
                    scope: 'global',
                    hash: '',
                    index: 0,
                    skip: 0,
                    timestamp: '',
                    type: 'TEST_ACTION',
                    input: { id: 'test' },
                },
                {
                    scope: 'global',
                    hash: '',
                    index: 0,
                    skip: 0,
                    timestamp: '',
                    type: 'TEST_ACTION',
                    input: { id: 'test' },
                },
            ],
            local: [
                {
                    scope: 'local',
                    hash: '',
                    index: 0,
                    skip: 0,
                    timestamp: '',
                    type: 'TEST_ACTION',
                    input: { id: 'test' },
                },
            ],
        });

        expect(errors).toHaveLength(1);
        expect(errors[0].message).toStrictEqual(
            'Invalid operation index 0 at position 1',
        );
    });
});
