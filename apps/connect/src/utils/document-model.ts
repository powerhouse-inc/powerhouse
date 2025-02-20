import { logger } from '#services/logger';
import { Unsubscribe } from '#services/renown/types';
import { IDocumentDriveServer } from 'document-drive';
import type {
    Action,
    ActionErrorCallback,
    CustomAction,
    Operation,
    OperationScope,
    PHDocument,
    Reducer,
} from 'document-model';
import { useEffect, useState } from 'react';

const ENABLE_SYNC_DEBUG = false;

export const FILE_UPLOAD_OPERATIONS_CHUNK_SIZE = parseInt(
    import.meta.env.FILE_UPLOAD_OPERATIONS_CHUNK_SIZE! || '50',
);

export type DocumentDispatchCallback<TGlobalState, TLocalState> = (
    operation: Operation,
    state: {
        prevState: PHDocument<TGlobalState, TLocalState>;
        newState: PHDocument<TGlobalState, TLocalState>;
    },
) => void;

export type DocumentDispatch<
    TGlobalState,
    TLocalState,
    TCustomAction extends CustomAction = never,
> = (
    action: TCustomAction | CustomAction | Action,
    callback?: DocumentDispatchCallback<TGlobalState, TLocalState>,
    onErrorCallback?: ActionErrorCallback,
) => void;

export function wrapReducer<
    TGlobalState,
    TLocalState,
    TCustomAction extends CustomAction = never,
>(
    reducer:
        | Reducer<
              TGlobalState,
              TLocalState,
              TCustomAction | CustomAction | Action
          >
        | undefined,
    onError?: (error: unknown) => void,
): Reducer<TGlobalState, TLocalState, TCustomAction | CustomAction | Action> {
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

export function useDocumentDispatch<
    TGlobalState,
    TLocalState,
    TCustomAction extends CustomAction = never,
>(
    documentReducer:
        | Reducer<
              TGlobalState,
              TLocalState,
              TCustomAction | CustomAction | Action
          >
        | undefined,
    initialState: PHDocument<TGlobalState, TLocalState> | undefined,
    onError: OnErrorHandler = logger.error,
): readonly [
    PHDocument<TGlobalState, TLocalState> | undefined,
    DocumentDispatch<TGlobalState, TLocalState, TCustomAction>,
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
        setError(undefined);
    }, [initialState]);

    const dispatch: DocumentDispatch<
        TGlobalState,
        TLocalState,
        TCustomAction
    > = (action, callback, onErrorCallback?: ActionErrorCallback) => {
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
            debugLog(`reactor.on(strandUpdate)`, update);
            const sameScope =
                update.documentId === documentId && update.scope == scope;

            if (!sameScope) {
                debugLog(
                    `reactor.on(strandUpdate) Ignoring wrong scope: ${update.documentId}:${update.scope} <> ${documentId}:${scope}`,
                );
                return;
            }

            const lastUpdateIndex = update.operations.at(-1)?.index;
            if (lastUpdateIndex && lastUpdateIndex >= lastIndex) {
                debugLog(
                    `reactor.on(strandUpdate) Resolving ${update.documentId}:${update.scope} rev ${lastUpdateIndex} >= ${lastIndex}`,
                );
                resolve();
            } else {
                debugLog(
                    `reactor.on(strandUpdate) Not resolving ${update.documentId}:${update.scope} rev ${lastUpdateIndex} < ${lastIndex}`,
                );
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

const debugID = `[dm.ts #${Math.floor(Math.random() * 999)}]`;
const debugLog = (...data: any[]) => {
    if (!ENABLE_SYNC_DEBUG) {
        return;
    }

    if (data.length > 0 && typeof data[0] === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        console.log(`${debugID} ${data[0]}`, ...data.slice(1));
    } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        console.log(debugID, ...data);
    }
};

export async function uploadDocumentOperations(
    drive: string,
    documentId: string,
    document: PHDocument,
    reactor: IDocumentDriveServer,
    pushOperations: (
        driveId: string,
        id: string,
        operations: Operation[],
    ) => Promise<PHDocument | undefined>,
    options?: { waitForSync?: boolean; operationsLimit?: number },
) {
    const operationsLimit =
        options?.operationsLimit || FILE_UPLOAD_OPERATIONS_CHUNK_SIZE;

    debugLog(
        `uploadDocumentOperations(drive: ${drive}, documentId:${documentId}, ops: ${Object.keys(document.operations).join(',')}, limit:${operationsLimit})`,
    );

    for (const operations of Object.values(document.operations)) {
        for (let i = 0; i < operations.length; i += operationsLimit) {
            debugLog(
                `uploadDocumentOperations:for(i:${i}, ops:${operations.length}, limit:${operationsLimit}): START`,
            );
            const chunk = operations.slice(i, i + operationsLimit);
            const operation = chunk.at(-1);
            if (!operation) {
                break;
            }
            const { scope } = operation;

            /*
            TODO: check why the waitForUpdate promise does not resolve after the first iteration
            if (options?.waitForSync) {
                void pushOperations(drive, documentId, chunk);
                await waitForUpdate(
                    10000,
                    documentId,
                    scope,
                    operation.index,
                    reactor,
                );
            } else {
                await pushOperations(drive, documentId, chunk);
            }
            */

            await pushOperations(drive, documentId, chunk);

            debugLog(
                `uploadDocumentOperations:for:waitForUpdate(${documentId}:${scope} rev ${operation.index}): NEXT`,
            );
        }
    }

    debugLog(`uploadDocumentOperations:for:waitForUpdate(${documentId}): END`);
}
