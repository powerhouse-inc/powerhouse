import { castDraft, produce } from 'immer';
import {
    loadStateOperation,
    noopOperation,
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
import { UndoRedoAction, z } from './schema';
import {
    Action,
    Document,
    ImmutableStateReducer,
    Operation,
    ReducerOptions,
} from './types';
import {
    isBaseAction,
    isUndoRedo,
    hashDocument,
    replayOperations,
    isNoopOperation,
    calculateSkipsLeft,
} from './utils/base';
import { SignalDispatch } from './signal';
import { documentHelpers } from './utils';
import {
    OperationIndex,
    SkipHeaderOperationIndex,
} from './utils/document-helpers';

/**
 * Gets the next revision number based on the provided action.
 *
 * @param state The current state of the document.
 * @param action The action being applied to the document.
 * @returns The next revision number.
 */
function getNextRevision(
    document: Document,
    action: Action | Operation,
): number {
    let latestOperation: Operation | undefined;

    if ('index' in action) {
        latestOperation = { ...action };
    } else {
        latestOperation = document.operations[action.scope].at(-1);
    }

    return (latestOperation?.index ?? -1) + 1;
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
function updateOperations<T extends Document>(
    document: T,
    action: Action | Operation,
    skip = 0,
): T {
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

    const latestOperation = [...operations].pop();
    let nextIndex = (latestOperation?.index ?? -1) + 1;

    if ('index' in action) {
        if (action.index > nextIndex + skip) {
            throw new Error(
                `Missing operations: expected ${nextIndex} with skip 0 or equivalent, got index ${action.index} with skip ${skip}`,
            );
        }

        nextIndex = action.index;
    }

    // adds the operation to its scope operations
    operations.push({
        ...action,
        index: nextIndex,
        timestamp: new Date().toISOString(),
        hash: '',
        scope,
        skip,
        error: undefined,
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
function updateDocument<T extends Document>(
    document: T,
    action: Action,
    skip = 0,
) {
    let newDocument = updateOperations(document, action, skip);
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
        case PRUNE:
            return pruneOperation(document, action, wrappedReducer);
        case LOAD_STATE:
            return loadStateOperation(document, action.input.state);
        default:
            return document;
    }
}

type UndoRedoProcessResult<T, A extends Action, L> = {
    document: Document<T, A, L>;
    action: A | BaseAction;
    skip: number;
};

/**
 * Processes an UNDO or REDO action.
 *
 * @param document The current state of the document.
 * @param action The action being applied to the document.
 * @param skip The number of operations to skip before applying the action.
 * @returns The updated document, calculated skip value and transformed action (if apply).
 */
export function processUndoRedo<T, A extends Action, L>(
    document: Document<T, A, L>,
    action: UndoRedoAction,
    skip: number,
): UndoRedoProcessResult<T, A, L> {
    switch (action.type) {
        case UNDO:
            return undoOperation(document, action, skip);
        case REDO:
            return redoOperation(document, action, skip);
        default:
            return { document, action, skip };
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
    action: A | BaseAction | Operation,
    customReducer: ImmutableStateReducer<T, A, L>,
    dispatch?: SignalDispatch,
    options: ReducerOptions = {},
) {
    // if there's skip value
    // 0:0 1:0 2:0 3:0 4:1(new action)
    // garbagecollector(0:0 1:0 2:0 3:0 4:1)
    // 0:0 1:0 2:0 4:1
    // replayedDocument = replayOperation(0:0 1:0 2:0)
    // newDocument = {...document, state: {...replayedDocument.state} }

    // resutl = reducer(newDocument, 4:1)

    const { skip, ignoreSkipOperations = false, reuseHash = false } = options;

    const _action = { ...action };
    const skipValue = skip || 0;
    let newDocument = { ...document };
    // let clipboard = [...document.clipboard];
    const scope = action.scope;

    if (
        !ignoreSkipOperations &&
        (skipValue > 0 || ('index' in _action && _action.skip > 0))
    ) {
        let skipHeaderOperation: SkipHeaderOperationIndex;

        if ('index' in _action) {
            // Flow for Operation (Event)
            skipHeaderOperation = { index: _action.index, skip: _action.skip };
        } else {
            // Flow for Action (Command)
            skipHeaderOperation = { skip: skipValue };
        }

        const documentOperations = {
            ...newDocument.operations,
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            [scope]: documentHelpers.skipHeaderOperations(
                newDocument.operations[scope],
                skipHeaderOperation,
            ),
        };

        const { state } = replayOperations(
            newDocument.initialState,
            documentOperations,
            customReducer,
            undefined,
            undefined,
            undefined,
        );

        newDocument = {
            ...newDocument,
            state,
        };
    }

    // ignore undo redo for now

    // if (isUndoRedo(_action)) {
    //     const {
    //         skip: calculatedSkip,
    //         action: transformedAction,
    //         document: processedDocument,
    //     } = processUndoRedo(document, _action, skipValue);

    //     _action = transformedAction;
    //     skipValue = calculatedSkip;
    //     newDocument = processedDocument;
    //     clipboard = [...newDocument.clipboard];
    // }

    // if the action is one the base document actions (SET_NAME, UNDO, REDO, PRUNE)
    // then runs the base reducer first
    if (isBaseAction(_action)) {
        newDocument = _baseReducer(newDocument, _action, customReducer);
    }

    // updates the document revision number, last modified date
    // and operation history
    newDocument = updateDocument(newDocument, _action, skipValue);

    // wraps the custom reducer with Immer to avoid
    // mutation bugs and allow writing reducers with
    // mutating code
    newDocument = produce(newDocument, draft => {
        // the reducer runs on a immutable version of
        // provided state
        try {
            const returnedDraft = customReducer(
                draft.state,
                _action as A,
                dispatch,
            );

            // const clipboardValue = isUndoRedo(action) ? [...clipboard] : [];

            // if the reducer creates a new state object instead
            // of mutating the draft then returns the new state
            if (returnedDraft) {
                // casts new state as draft to comply with typescript
                return castDraft<Document<T, A, L>>({
                    ...newDocument,
                    // clipboard: [...clipboardValue],
                    state: returnedDraft,
                });
            } else {
                // draft.clipboard = castDraft([...clipboardValue]);
            }
        } catch (error) {
            // TODO: if the reducer throws an error then we should keep the previous state (before replayOperations)
            // and remove skip number from action/operation
            const lastOperationIndex =
                newDocument.operations[_action.scope].length - 1;
            draft.operations[_action.scope][lastOperationIndex].error = (
                error as Error
            ).message;
        }
    });

    // updates the document history
    return produce(newDocument, draft => {
        // meta operations are not added to the operations history
        if ([UNDO, REDO, PRUNE].includes(_action.type)) {
            return draft;
        }

        // if reuseHash is true, checks if the action has
        // an hash and uses it instead of generating it
        const scope = _action.scope || 'global';
        const hash =
            reuseHash && Object.prototype.hasOwnProperty.call(_action, 'hash')
                ? (_action as Operation).hash
                : hashDocument(draft, scope);

        // updates the last operation with the hash of the resulting state
        draft.operations[scope][draft.operations[scope].length - 1].hash = hash;

        // if the action has attachments then adds them to the document
        if (!isBaseAction(_action) && _action.attachments) {
            _action.attachments.forEach(attachment => {
                const { hash, ...file } = attachment;
                draft.attachments[hash] = {
                    ...file,
                };
            });
        }
    });
}
