import { IDocumentDriveServer } from 'document-drive';
import type {
    Action,
    ActionErrorCallback,
    BaseAction,
    Document,
    Operation,
    OperationScope,
    Reducer,
} from 'document-model/document';
import { useEffect, useState } from 'react';
import { logger } from 'src/services/logger';
import { Unsubscribe } from 'src/services/renown/types';

export const FILE_UPLOAD_OPERATIONS_CHUNK_SIZE = parseInt(
    (import.meta.env.FILE_UPLOAD_OPERATIONS_CHUNK_SIZE as string) || '50',
);

export type DocumentDispatchCallback<State, A extends Action, LocalState> = (
    operation: Operation,
    state: {
        prevState: Document<State, A, LocalState>;
        newState: Document<State, A, LocalState>;
    },
) => void;

export type DocumentDispatch<State, A extends Action, LocalState> = (
    action: A | BaseAction,
    callback?: DocumentDispatchCallback<State, A, LocalState>,
    onErrorCallback?: ActionErrorCallback,
) => void;

export function wrapReducer<State, A extends Action, LocalState>(
    reducer: Reducer<State, A, LocalState> | undefined,
    onError?: (error: unknown) => void,
): Reducer<State, A, LocalState> {
    return (state, action) => {
        if (!reducer) return state;
        try {
            return reducer(state, action);
        } catch (error) {
            onError?.(error);
            return state;
        }
    };
}

type OnErrorHandler = (error: unknown) => void;

export function useDocumentDispatch<State, A extends Action, LocalState>(
    documentReducer: Reducer<State, A, LocalState> | undefined,
    initialState: Document<State, A, LocalState> | undefined,
    onError: OnErrorHandler = logger.error,
): readonly [
    Document<State, A, LocalState> | undefined,
    DocumentDispatch<State, A, LocalState>,
    unknown,
] {
    const [state, setState] = useState(initialState);
    const [error, setError] = useState<unknown>();

    const onErrorHandler: OnErrorHandler = error => {
        setError(error);
        onError(error);
    };

    useEffect(() => {
        setState(initialState);
    }, [initialState]);

    const dispatch: DocumentDispatch<State, A, LocalState> = (
        action,
        callback,
        onErrorCallback?: ActionErrorCallback,
    ) => {
        setError(undefined);
        setState(_state => {
            if (!documentReducer || !_state) return _state;

            try {
                const newState = documentReducer(_state, action);
                const scope = action.scope ?? 'global';
                const operations = newState.operations[scope];
                const operation = operations[operations.length - 1];

                if (operation.error) {
                    const error = new Error(operation.error);

                    onErrorHandler(error);
                    onErrorCallback?.(error);
                }

                callback?.(operation, {
                    prevState: { ..._state },
                    newState: { ...newState },
                });

                return newState;
            } catch (error) {
                onErrorHandler(error);
                onErrorCallback?.(error);
                return _state;
            }
        });
    };

    return [state, dispatch, error] as const;
}

async function waitForUpdate(
    timeout: number,
    documentId: string,
    scope: OperationScope,
    lastIndex: number,
    reactor: IDocumentDriveServer,
) {
    let unsubscribe: Unsubscribe | undefined;
    const promise = new Promise<void>(resolve => {
        unsubscribe = reactor.on('strandUpdate', update => {
            const sameScope =
                update.documentId === documentId && update.scope == scope;
            if (!sameScope) {
                return;
            }

            const lastUpdateIndex = update.operations.at(-1)?.index;
            if (lastUpdateIndex && lastUpdateIndex >= lastIndex) {
                resolve();
            }
        });
    });

    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
            () =>
                reject(
                    new Error(
                        `Timed out waiting for operation ${lastIndex} for document ${documentId}`,
                    ),
                ),
            timeout,
        ),
    );

    const withTimeout = Promise.race([promise, timeoutPromise]);
    void withTimeout.finally(() => {
        unsubscribe?.();
    });

    return withTimeout;
}

export async function uploadDocumentOperations(
    drive: string,
    documentId: string,
    document: Document,
    reactor: IDocumentDriveServer,
    pushOperations: (
        driveId: string,
        id: string,
        operations: Operation[],
    ) => Promise<Document | undefined>,
    options?: { waitForSync?: boolean; operationsLimit?: number },
) {
    const operationsLimit =
        options?.operationsLimit || FILE_UPLOAD_OPERATIONS_CHUNK_SIZE;
    for (const operations of Object.values(document.operations)) {
        for (let i = 0; i < operations.length; i += operationsLimit) {
            const chunk = operations.slice(i, i + operationsLimit);
            const operation = chunk.at(-1);
            if (!operation) {
                break;
            }
            const { scope } = operation;

            await pushOperations(drive, documentId, chunk);

            if (!options?.waitForSync) {
                continue;
            }
            await waitForUpdate(
                10000,
                documentId,
                scope,
                operation.index,
                reactor,
            );
        }
    }
}
