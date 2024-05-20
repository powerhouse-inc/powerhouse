import { BaseAction, Document, Operation } from '../../src/document';
import { noop } from '../../src/document/actions';
import { createReducer, replayDocument } from '../../src/document/utils';
import {
    CountAction,
    CountLocalState,
    CountState,
    baseCountReducer,
    countReducer,
    decrement,
    increment,
} from '../helpers';

describe('DocumentModel Class', () => {
    const initialState = {
        name: '',
        revision: {
            global: 0,
            local: 0,
        },
        documentType: '',
        created: '',
        lastModified: '',
        state: {
            global: {
                count: 0,
            },
            local: {
                name: '',
            },
        },
        attachments: {},
    };
    const initialDocument: Document<CountState, CountAction, CountLocalState> =
        {
            name: '',
            revision: {
                global: 0,
                local: 0,
            },
            documentType: '',
            created: '',
            lastModified: '',
            state: {
                global: {
                    count: 0,
                },
                local: {
                    name: '',
                },
            },
            attachments: {},
            initialState,
            operations: { global: [], local: [] },
            clipboard: [],
        };

    it('should call reducer once per operation', () => {
        const mockReducer = vi.fn(baseCountReducer);
        const reducer = createReducer(mockReducer);

        let newDocument = reducer(initialDocument, increment());
        newDocument = reducer(newDocument, increment());
        newDocument = reducer(newDocument, increment());
        newDocument = reducer(newDocument, noop(), undefined, { skip: 1 });
        expect(mockReducer).toHaveBeenCalledTimes(6);
        expect(newDocument.state.global.count).toBe(2);
    });

    it('should reuse past operation state if available when skipping', () => {
        const mockReducer = vi.fn(baseCountReducer);
        const reducer = createReducer(mockReducer);

        const operations: Operation[] = [];

        let newDocument = reducer(initialDocument, increment());
        operations.push({
            ...newDocument.operations.global.at(-1)!,
            resultingState: newDocument.state.global,
        });
        newDocument = reducer(newDocument, increment());
        operations.push({
            ...newDocument.operations.global.at(-1)!,
            resultingState: newDocument.state.global,
        });
        newDocument = reducer(newDocument, increment());
        operations.push({
            ...newDocument.operations.global.at(-1)!,
            resultingState: newDocument.state.global,
        });
        newDocument = reducer(
            {
                ...newDocument,
                operations: { ...newDocument.operations, global: operations },
            },
            noop(),
            undefined,
            { skip: 1, reuseOperationResultingState: true },
        );
        expect(mockReducer).toHaveBeenCalledTimes(4);
        expect(newDocument.state.global.count).toBe(2);
    });

    it('should look for the latest resulting state when replaying the document', () => {
        const mockReducer = vi.fn(baseCountReducer);
        const reducer = createReducer(mockReducer);

        const operations: Operation<CountAction | BaseAction>[] = [];

        let newDocument = reducer(initialDocument, increment());
        operations.push({
            ...newDocument.operations.global.at(-1)!,
            resultingState: newDocument.state.global,
        });
        newDocument = reducer(newDocument, increment());
        operations.push(newDocument.operations.global.at(-1)!);
        newDocument = reducer(newDocument, increment());
        operations.push(newDocument.operations.global.at(-1)!);
        newDocument = reducer(
            {
                ...newDocument,
                operations: { ...newDocument.operations, global: operations },
            },
            noop(),
            undefined,
            { skip: 1, reuseOperationResultingState: true },
        );
        expect(mockReducer).toHaveBeenCalledTimes(5);
        expect(newDocument.state.global.count).toBe(2);
    });

    it('should replay document', () => {
        const document = replayDocument<
            CountState,
            CountAction,
            CountLocalState
        >(initialState, { global: [], local: [] }, countReducer);
        expect(initialDocument).toStrictEqual(document);
    });

    it('should replay document with operations', () => {
        const mockReducer = vi.fn(baseCountReducer);
        const reducer = createReducer(mockReducer);
        let newDocument = reducer(initialDocument, increment());
        newDocument = reducer(newDocument, increment());
        expect(mockReducer).toHaveBeenCalledTimes(2);
        const document = replayDocument<
            CountState,
            CountAction,
            CountLocalState
        >(initialState, newDocument.operations, reducer);
        expect(newDocument.state.global.count).toBe(2);
        expect(newDocument).toStrictEqual(document);
        expect(mockReducer).toHaveBeenCalledTimes(4);
    });

    it('should replay document with undone operations', () => {
        const mockReducer = vi.fn(baseCountReducer);
        const reducer = createReducer(mockReducer);

        let newDocument = reducer(initialDocument, increment());
        newDocument = reducer(newDocument, increment());
        newDocument = reducer(newDocument, noop(), undefined, { skip: 1 });
        expect(mockReducer).toHaveBeenCalledTimes(4);

        const document = replayDocument<
            CountState,
            CountAction,
            CountLocalState
        >(initialState, newDocument.operations, reducer);

        expect(mockReducer).toHaveBeenCalledTimes(6);

        expect(newDocument.state.global.count).toBe(1);
        expect(newDocument).toStrictEqual(document);
    });

    it('should reuse resulting state when replaying document with undone operations', () => {
        const mockReducer = vi.fn(baseCountReducer);
        const reducer = createReducer(mockReducer);

        let newDocument = reducer(initialDocument, increment());
        newDocument = reducer(
            {
                ...newDocument,
                operations: {
                    ...newDocument.operations,
                    global: [
                        {
                            ...newDocument.operations.global[0],
                            resultingState: newDocument.state.global,
                        },
                    ],
                },
            },
            increment(),
        );
        newDocument = reducer(newDocument, noop(), undefined, { skip: 1 });
        expect(mockReducer).toHaveBeenCalledTimes(4);
        expect(newDocument.state.global.count).toBe(1);

        const document = replayDocument<
            CountState,
            CountAction,
            CountLocalState
        >(
            initialState,
            newDocument.operations,
            reducer,
            undefined,
            undefined,
            undefined,
            { reuseOperationResultingState: true },
        );

        expect(mockReducer).toHaveBeenCalledTimes(5);
        expect(document.state.global.count).toBe(1);
        expect(newDocument).toStrictEqual(document);
    });
});
