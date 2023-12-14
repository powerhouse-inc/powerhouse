import { createDocument } from '../../src/document/utils';
import {
    CountAction,
    CountLocalState,
    CountState,
    countReducer,
    emptyReducer,
    setLocalName,
} from '../helpers';

describe('Local reducer', () => {
    beforeAll(() => {
        jest.useFakeTimers().setSystemTime(new Date('2020-01-01'));
    });

    it('should not update revision', async () => {
        const document = createDocument();
        const newDocument = emptyReducer(document, {
            type: 'TEST',
            input: {},
            scope: 'local',
        });
        expect(newDocument.revision).toBe(0);
    });

    it('should not update lastModified', async () => {
        jest.useFakeTimers();
        const document = createDocument();
        await new Promise(r => {
            setTimeout(r, 100);
            jest.runOnlyPendingTimers();
        });
        const newDocument = emptyReducer(document, {
            type: 'TEST',
            input: {},
            scope: 'local',
        });
        expect(document.lastModified).toBe(newDocument.lastModified);
        jest.useRealTimers();
    });

    it('should not update global operations list', async () => {
        jest.useFakeTimers({ now: new Date('2023-01-01') });
        const document = createDocument();
        const newDocument = emptyReducer(document, {
            type: 'TEST',
            input: {},
            scope: 'local',
        });

        expect(newDocument.operations.local).toStrictEqual([
            {
                type: 'TEST',
                timestamp: new Date().toISOString(),
                index: 0,
                input: {},
                hash: 'vyGp6PvFo4RvsFtPoIWeCReyIC8=',
                scope: 'local',
            },
        ]);
        expect(newDocument.operations.global).toStrictEqual([]);
    });

    it('should update local operations list', async () => {
        jest.useFakeTimers({ now: new Date('2023-01-01') });
        const document = createDocument();
        const newDocument = emptyReducer(document, {
            type: 'TEST',
            input: {},
            scope: 'local',
        });

        expect(newDocument.operations.local).toStrictEqual([
            {
                type: 'TEST',
                timestamp: new Date().toISOString(),
                index: 0,
                input: {},
                hash: 'vyGp6PvFo4RvsFtPoIWeCReyIC8=',
                scope: 'local',
            },
        ]);

        expect(newDocument.operations.global).toStrictEqual([]);
    });

    it('should update local name', async () => {
        const document = createDocument<
            CountState,
            CountAction,
            CountLocalState
        >({
            documentType: 'powerhouse/counter',
            state: { global: { count: 0 }, local: { name: '' } },
        });
        const newDocument = countReducer(document, setLocalName('test'));
        expect(newDocument.state).toStrictEqual({
            global: { count: 0 },
            local: { name: 'test' },
        });
        expect(document.state).toStrictEqual({
            global: { count: 0 },
            local: { name: '' },
        });

        expect(newDocument.operations).toStrictEqual({
            global: [],
            local: [
                {
                    hash: 'HbiD0GRM+ijPjZ/N3Kw+6WxMTNI=',
                    type: 'SET_LOCAL_NAME',
                    input: 'test',
                    index: 0,
                    scope: 'local',
                    timestamp: new Date().toISOString(),
                },
            ],
        });
    });
});
