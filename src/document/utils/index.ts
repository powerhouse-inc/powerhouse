import fs from 'fs';
import produce, { castDraft } from 'immer';
import JSZip from 'jszip';
import { join } from 'path';
import { BaseAction } from '../actions';
import { baseReducer } from '../reducer';
import {
    Action,
    Attachment,
    Document,
    ImmutableReducer,
    Reducer,
} from '../types';

// helper to be used by action creators
export function createAction<A extends Action>(
    type: A['type'],
    input: A['input'] = {} as A['input']
): A {
    if (!type) {
        throw new Error('Empty action type');
    }

    if (typeof type !== 'string') {
        throw new Error(`Invalid action type: ${type}`);
    }

    return { type, input } as A;
}

// wraps reducer with documentReducer, adding support for
// document actions: SET_NAME, UNDO, REDO, PRUNE
// Also updates the document-related attributes on every operation
export function createReducer<T = unknown, A extends Action = Action>(
    reducer: ImmutableReducer<T, A>,
    documentReducer = baseReducer
) {
    return (state: Document<T, A | BaseAction>, action: A | BaseAction) => {
        // first runs the action by the document reducer to
        // update document fields and support base actions
        const newState = documentReducer<T, A>(state, action, reducer);

        // wraps the custom reducer with Immer to avoid
        // mutation bugs and allow writing reducers with
        // mutating code
        return produce(newState, draft => {
            // the reducer runs on a immutable version of
            // provided state
            const newDraft = reducer(draft, action as A);

            // if the reducer creates a new state object instead
            // of mutating the draft then returns the new state
            if (newDraft) {
                // casts new state as draft to comply with typescript
                return castDraft(newDraft);
            }
        });
    };
}

// builds the initial document state from the provided data
export const createDocument = <T, A extends Action>(
    initialState?: Partial<Document<T, A>> & { data: T }
): Document<T, A> => {
    const state = {
        name: '',
        documentType: '',
        revision: 0,
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        data: {} as T,
        operations: [],
        ...initialState,
    };

    // saves the initial state
    const { initialState: _, ...newInitialState } = state;
    return {
        ...state,
        initialState: newInitialState,
    };
};

export const saveToFile = (
    document: Document,
    path: string,
    extension: string
): Promise<string> => {
    // create zip file
    const zip = new JSZip();
    zip.file('state.json', JSON.stringify(document.initialState, null, 2));
    zip.file('operations.json', JSON.stringify(document.operations, null, 2));

    const filePath = join(path, `${document.name}.${extension}.zip`);
    fs.mkdirSync(path, { recursive: true });

    return new Promise((resolve, reject) => {
        try {
            zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true })
                .pipe(fs.createWriteStream(filePath))
                .on('finish', () => {
                    resolve(filePath);
                })
                .on('error', error => {
                    reject(error);
                });
        } catch (error) {
            reject(error);
        }
    });
};

export const loadFromFile = async <S, A extends Action>(
    path: string,
    reducer: Reducer<S, A | BaseAction>
) => {
    const file = fs.readFileSync(path);
    const zip = new JSZip();
    await zip.loadAsync(file);

    const stateZip = zip.file('state.json');
    if (!stateZip) {
        throw new Error('Initial state not found');
    }
    const state = JSON.parse(await stateZip.async('string')) as Document<
        S,
        A | BaseAction
    >;

    const operationsZip = zip.file('operations.json');
    if (!operationsZip) {
        throw new Error('Operations history not found');
    }
    const operations = JSON.parse(await operationsZip.async('string')) as (
        | A
        | BaseAction
    )[];

    return operations.reduce(
        (state, operation) => reducer(state, operation),
        state
    );
};

export const fetchAttachment = async (input: string): Promise<Attachment> => {
    return `attachment://${input.slice(input.lastIndexOf('/') + 1)}`;
};
