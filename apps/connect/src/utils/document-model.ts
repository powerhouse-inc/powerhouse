import { type Unsubscribe } from '#services';
import { childLogger, type IDocumentDriveServer } from 'document-drive';
import type {
    ActionErrorCallback,
    ActionFromDocument,
    Operation,
    OperationFromDocument,
    OperationScope,
    PHDocument,
    Reducer,
} from 'document-model';
import { useEffect, useState } from 'react';

const logger = childLogger([
    'utils/document-model',
    Math.floor(Math.random() * 999).toString(),
]);

export const FILE_UPLOAD_OPERATIONS_CHUNK_SIZE = parseInt(
    import.meta.env.FILE_UPLOAD_OPERATIONS_CHUNK_SIZE || '50',
);

export type DocumentDispatchCallback<TDocument extends PHDocument> = (
    operation: OperationFromDocument<TDocument>,
    state: {
        prevState: TDocument;
        newState: TDocument;
    },
) => void;

export type DocumentDispatch<TDocument extends PHDocument> = (
    action: ActionFromDocument<TDocument>,
    callback?: DocumentDispatchCallback<TDocument>,
    onErrorCallback?: ActionErrorCallback,
) => void;

export function wrapReducer<TDocument extends PHDocument>(
    reducer: Reducer<TDocument> | undefined,
    onError?: (error: unknown) => void,
): Reducer<TDocument> {
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

export function useDocumentDispatch<TDocument extends PHDocument>(
    documentReducer: Reducer<TDocument> | undefined,
    initialState: TDocument | undefined,
    onError: OnErrorHandler = logger.error,
): readonly [TDocument | undefined, DocumentDispatch<TDocument>, unknown] {
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

    const dispatch: DocumentDispatch<TDocument> = (
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
            logger.verbose(`reactor.on(strandUpdate)`, update);
            const sameScope =
                update.documentId === documentId && update.scope == scope;

            if (!sameScope) {
                logger.verbose(
                    `reactor.on(strandUpdate) Ignoring wrong scope: ${update.documentId}:${update.scope} <> ${documentId}:${scope}`,
                );
                return;
            }

            const lastUpdateIndex = update.operations.at(-1)?.index;
            if (lastUpdateIndex && lastUpdateIndex >= lastIndex) {
                logger.verbose(
                    `reactor.on(strandUpdate) Resolving ${update.documentId}:${update.scope} rev ${lastUpdateIndex} >= ${lastIndex}`,
                );
                resolve();
            } else {
                logger.verbose(
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

export async function uploadDocumentOperations(
    documentId: string,
    document: PHDocument,
    pushOperations: (
        id: string,
        operations: Operation[],
    ) => Promise<PHDocument | undefined>,
    options?: { waitForSync?: boolean; operationsLimit?: number },
) {
    const operationsLimit =
        options?.operationsLimit || FILE_UPLOAD_OPERATIONS_CHUNK_SIZE;

    logger.verbose(
        `uploadDocumentOperations(documentId:${documentId}, ops: ${Object.keys(document.operations).join(',')}, limit:${operationsLimit})`,
    );

    for (const operations of Object.values(document.operations)) {
        for (let i = 0; i < operations.length; i += operationsLimit) {
            logger.verbose(
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

            await pushOperations(documentId, chunk);

            logger.verbose(
                `uploadDocumentOperations:for:waitForUpdate(${documentId}:${scope} rev ${operation.index}): NEXT`,
            );
        }
    }

    logger.verbose(
        `uploadDocumentOperations:for:waitForUpdate(${documentId}): END`,
    );
}
