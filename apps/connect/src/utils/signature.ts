import { logger } from 'document-drive';
import {
    Action,
    ActionSigner,
    buildSignedOperation,
    OperationFromDocument,
    OperationSignatureContext,
    PHDocument,
    Reducer,
    User,
} from 'document-model';

export async function signOperation<TDocument extends PHDocument>(
    operation: OperationFromDocument<TDocument>,
    sign: (data: Uint8Array) => Promise<Uint8Array>,
    documentId: string,
    document: TDocument,
    reducer?: Reducer<TDocument>,
    user?: User,
): Promise<OperationFromDocument<TDocument>> {
    if (!user) return operation;
    if (!operation.context) return operation;
    if (!operation.context.signer) return operation;
    if (!reducer) {
        logger.error(
            `Document model '${document.documentType}' does not have a reducer`,
        );
        return operation;
    }

    const context: Omit<
        OperationSignatureContext,
        'operation' | 'previousStateHash'
    > = {
        documentId,
        signer: operation.context.signer,
    };

    const signedOperation = await buildSignedOperation(
        operation,
        reducer,
        document,
        context,
        sign,
    );

    return signedOperation;
}

export function addActionContext<A extends Action = Action>(
    action: A,
    connectDid?: string,
    user?: User,
) {
    if (!user) return action;

    const signer: ActionSigner = {
        app: {
            name: 'Connect',
            key: connectDid || '',
        },
        user: {
            address: user.address,
            networkId: user.networkId,
            chainId: user.chainId,
        },
        signatures: [],
    };

    return {
        context: { signer },
        ...action,
    };
}
