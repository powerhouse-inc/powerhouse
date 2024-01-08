import { prune, redo, undo } from '../../src/document/actions';
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

    it('should update local revision', async () => {
        const document = createDocument();
        const newDocument = emptyReducer(document, {
            type: 'TEST',
            input: {},
            scope: 'local',
        });
        expect(newDocument.revision.local).toBe(1);
    });

    it('should update lastModified', async () => {
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
        expect(new Date(document.lastModified).getTime()).toBeLessThan(
            new Date(newDocument.lastModified).getTime(),
        );
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

    it('should undo local operation', async () => {
        const document = createDocument<
            CountState,
            CountAction,
            CountLocalState
        >({
            documentType: 'powerhouse/counter',
            state: { global: { count: 0 }, local: { name: '' } },
        });
        let newDocument = countReducer(document, setLocalName('test'));

        expect(newDocument.revision).toStrictEqual({ global: 0, local: 1 });
        newDocument = countReducer(newDocument, undo(1, 'local'));
        expect(newDocument.revision).toStrictEqual({ global: 0, local: 0 });
        expect(newDocument.state).toStrictEqual({
            global: { count: 0 },
            local: { name: '' },
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

    it('should redo local operation', async () => {
        const document = createDocument<
            CountState,
            CountAction,
            CountLocalState
        >({
            documentType: 'powerhouse/counter',
            state: { global: { count: 0 }, local: { name: '' } },
        });
        let newDocument = countReducer(document, setLocalName('test'));
        newDocument = countReducer(newDocument, undo(1, 'local'));
        newDocument = countReducer(newDocument, redo(1, 'local'));
        expect(newDocument.revision).toStrictEqual({ global: 0, local: 1 });
        expect(newDocument.state).toStrictEqual({
            global: { count: 0 },
            local: { name: 'test' },
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

    it('should prune local operations', async () => {
        const document = createDocument<
            CountState,
            CountAction,
            CountLocalState
        >({
            documentType: 'powerhouse/counter',
            state: { global: { count: 0 }, local: { name: '' } },
        });
        let newDocument = countReducer(document, setLocalName('test'));
        newDocument = countReducer(newDocument, setLocalName('test 2'));
        expect(newDocument.revision).toStrictEqual({ global: 0, local: 2 });
        expect(newDocument.state).toStrictEqual({
            global: { count: 0 },
            local: { name: 'test 2' },
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

                {
                    hash: 'QIsBfXG+5+X+ju/tv2PHkg0SyEM=',
                    type: 'SET_LOCAL_NAME',
                    input: 'test 2',
                    index: 1,
                    scope: 'local',
                    timestamp: new Date().toISOString(),
                },
            ],
        });

        newDocument = countReducer(newDocument, prune(0, undefined, 'local'));
        expect(newDocument.revision).toStrictEqual({ global: 1, local: 0 });
        expect(newDocument.state).toStrictEqual({
            global: { count: 0 },
            local: { name: 'test 2' },
        });
        expect(newDocument.operations).toStrictEqual({
            global: [
                {
                    hash: 'ch7MNww9+xUYoTgutbGr6VU0GaU=',
                    type: 'LOAD_STATE',
                    input: {
                        operations: 2,
                        state: {
                            name: '',
                            state: {
                                global: { count: 0 },
                                local: { name: 'test 2' },
                            },
                        },
                    },
                    index: 0,
                    scope: 'global',
                    timestamp: new Date().toISOString(),
                },
            ],
            local: [],
        });
    });
});
