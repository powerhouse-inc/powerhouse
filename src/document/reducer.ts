import { castDraft, produce } from 'immer';
import {
    loadStateOperation,
    pruneOperation,
    redoOperation,
    setNameOperation,
    undoOperation,
} from './actions';
import {
    BaseAction,
    LOAD_STATE,
    PRUNE,
    REDO,
    SET_NAME,
    UNDO,
} from './actions/types';
import { z } from './schema';
import { Action, Document, ImmutableStateReducer } from './types';
import { isBaseAction, hashDocument } from './utils';
import { SignalDispatch } from './signal';

/**
 * Gets the next revision number based on the provided action.
 *
 * @param state The current state of the document.
 * @param action The action being applied to the document.
 * @returns The next revision number.
 */
function getNextRevision(document: Document, action: Action): number {
    const currentRevision = document.revision[action.scope];
    // UNDO, REDO and PRUNE alter the revision themselves
    return [UNDO, REDO, PRUNE].includes(action.type)
        ? currentRevision
        : currentRevision + 1;
}

/**
 * Updates the document header with the latest revision number and
 * date of last modification.
 *
 * @param state The current state of the document.
 * @param action The action being applied to the document.
 * @returns The updated document state.
 */
function updateHeader<T extends Document>(document: T, action: Action): T {
    return {
        ...document,
        revision: {
            ...document.revision,
            [action.scope]: getNextRevision(document, action),
        },
        lastModified: new Date().toISOString(),
    };
}

/**
 * Updates the operations history of the document based on the provided action.
 *
 * @param state The current state of the document.
 * @param action The action being applied to the document.
 * @returns The updated document state.
 */
function updateOperations<T extends Document>(document: T, action: Action): T {
    // UNDO, REDO and PRUNE are meta operations
    // that alter the operations history themselves
    if ([UNDO, REDO, PRUNE].includes(action.type)) {
        return document;
    }

    const { scope } = action;

    // removes undone operations from history if there
    // is a new operation after an UNDO
    const operations = document.operations[scope].slice(
        0,
        document.revision[scope],
    );

    // adds the operation to its scope operations
    operations.push({
        ...action,
        index: operations.length,
        timestamp: new Date().toISOString(),
        hash: '',
        scope,
        skip: action.skip || 0,
    });

    // adds the action to the operations history with
    // the latest index and current timestamp
    return {
        ...document,
        operations: { ...document.operations, [scope]: operations },
    };
}

/**
 * Updates the document state based on the provided action.
 *
 * @param state The current state of the document.
 * @param action The action being applied to the document.
 * @returns The updated document state.
 */
function updateDocument<T extends Document>(document: T, action: Action) {
    let newDocument = updateOperations(document, action);
    newDocument = updateHeader(newDocument, action);
    return newDocument;
}

/**
 * The base document reducer function that wraps a custom reducer function.
 *
 * @param state The current state of the document.
 * @param action The action being applied to the document.
 * @param wrappedReducer The custom reducer function being wrapped by the base reducer.
 * @returns The updated document state.
 */
function _baseReducer<T, A extends Action, L>(
    document: Document<T, A, L>,
    action: BaseAction,
    wrappedReducer: ImmutableStateReducer<T, A, L>,
): Document<T, A, L> {
    // throws if action is not valid base action
    z.BaseActionSchema().parse(action);

    switch (action.type) {
        case SET_NAME:
            return setNameOperation(document, action.input);
        case UNDO:
            return undoOperation(document, action, wrappedReducer);
        case REDO:
            return redoOperation(document, action, wrappedReducer);
        case PRUNE:
            return pruneOperation(document, action, wrappedReducer);
        case LOAD_STATE:
            return loadStateOperation(document, action.input.state);
        default:
            return document;
    }
}
/**
 * Base document reducer that wraps a custom document reducer and handles
 * document-level actions such as undo, redo, prune, and set name.
 *
 * @template T - The type of the state of the custom reducer.
 * @template A - The type of the actions of the custom reducer.
 * @param state - The current state of the document.
 * @param action - The action object to apply to the state.
 * @param customReducer - The custom reducer that implements the application logic
 * specific to the document's state.
 * @returns The new state of the document.
 */
export function baseReducer<T, A extends Action, L>(
    document: Document<T, A, L>,
    action: A | BaseAction,
    customReducer: ImmutableStateReducer<T, A, L>,
    dispatch?: SignalDispatch,
) {
    // if the action is one the base document actions (SET_NAME, UNDO, REDO, PRUNE)
    // then runs the base reducer first
    let newDocument = document;
    if (isBaseAction(action)) {
        newDocument = _baseReducer(newDocument, action, customReducer);
    }

    // updates the document revision number, last modified date
    // and operation history
    newDocument = updateDocument(newDocument, action);

    // wraps the custom reducer with Immer to avoid
    // mutation bugs and allow writing reducers with
    // mutating code
    newDocument = produce(newDocument, draft => {
        // the reducer runs on a immutable version of
        // provided state
        const returnedDraft = customReducer(draft.state, action as A, dispatch);

        // if the reducer creates a new state object instead
        // of mutating the draft then returns the new state
        if (returnedDraft) {
            // casts new state as draft to comply with typescript
            return castDraft<Document<T, A, L>>({
                ...newDocument,
                state: returnedDraft,
            });
        }
    });

    // updates the document history
    return produce(newDocument, draft => {
        // meta operations are not added to the operations history
        if ([UNDO, REDO, PRUNE].includes(action.type)) {
            return draft;
        }

        // updates the last operation with the hash of the resulting state
        const scope = action.scope || 'global';
        draft.operations[scope][draft.operations[scope].length - 1].hash =
            hashDocument(draft, scope);

        // if the action has attachments then adds them to the document
        if (!isBaseAction(action) && action.attachments) {
            action.attachments.forEach(attachment => {
                const { hash, ...file } = attachment;
                draft.attachments[hash] = {
                    ...file,
                };
            });
        }
    });
}
