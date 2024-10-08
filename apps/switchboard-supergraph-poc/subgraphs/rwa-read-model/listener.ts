import { InternalTransmitterUpdate, Listener, OperationUpdate } from 'document-drive';
import {
    DocumentDriveDocument
} from 'document-model-libs/document-drive';
import {
    CreateAccountInput,
    DeleteAccountInput,
    RealWorldAssetsDocument,
    RealWorldAssetsState
} from 'document-model-libs/real-world-assets';


const logger = {
    info: (msg: string) => console.log(msg),
    debug: (msg: string) => console.log(msg),
    error: (msg: string) => console.log(msg),
    warn: (msg: string) => console.log(msg),
    fatal: (msg: string) => console.log(msg),
}

export const options: Omit<Listener, 'driveId'> = {
    listenerId: 'real-world-assets',
    filter: {
        branch: ['main'],
        documentId: ['*'],
        documentType: ['makerdao/rwa-portfolio'],
        scope: ['*']
    },
    block: false,
    label: 'real-world-assets',
    system: true,
};

export async function transmit(
    strands: InternalTransmitterUpdate<
        RealWorldAssetsDocument | DocumentDriveDocument,
        'global'
    >[]
) {
    // logger.debug(strands);
    for (const strand of strands) {
        await handleRwaDocumentStrand(
            strand as InternalTransmitterUpdate<
                RealWorldAssetsDocument,
                'global'
            >
        );
    }
}


function strandStartsFromOpZero(
    strand: InternalTransmitterUpdate<
        DocumentDriveDocument | RealWorldAssetsDocument,
        'global'
    >
) {
    const resetNeeded =
        strand.operations.length > 0 &&
        (strand.operations[0]!.index === 0 ||
            strand.operations[strand.operations.length - 1]!.index -
            strand.operations[strand.operations.length - 1]!.skip ===
            0);
    logger.debug(`Reset needed: ${resetNeeded}`);
    return resetNeeded;
}

const listenerState = {
    amountOfAccounts: 0
}

async function rebuildRwaPortfolio(
    driveId: string,
    documentId: string,
    state: RealWorldAssetsState
) {
    const {
        accounts
    } = state;

    listenerState.amountOfAccounts = accounts.length;
}

const surgicalOperations: Record<
    string,
    (
        input: any
    ) => Promise<void>
> = {

    CREATE_ACCOUNT: async (
        input: CreateAccountInput,
    ) => {
        logger.debug('Creating account');
        listenerState.amountOfAccounts++;
    },
    DELETE_ACCOUNT: async (
        input: DeleteAccountInput,
    ) => {
        logger.debug('Deleting account');
        listenerState.amountOfAccounts--;
    },

};

async function handleRwaDocumentStrand(
    strand: InternalTransmitterUpdate<RealWorldAssetsDocument, 'global'>
) {
    logger.debug(
        `Received strand for document ${strand.documentId} with operations: ${strand.operations.map(op => op.type).join(', ')}`
    );

    if (
        strandStartsFromOpZero(strand) ||
        !allOperationsAreSurgical(strand, surgicalOperations)
    ) {
        await rebuildRwaPortfolio(
            strand.driveId,
            strand.documentId,
            strand.state
        );
        return;
    }

    for (const operation of strand.operations) {
        await doSurgicalRwaPortfolioUpdate(operation);
    }
}

async function doSurgicalRwaPortfolioUpdate(
    operation: OperationUpdate
) {
    logger.debug('Doing surgical rwa portfolio update');
    await surgicalOperations[operation.type]!(operation.input);
}

function allOperationsAreSurgical(
    strand: InternalTransmitterUpdate<RealWorldAssetsDocument, 'global'>,
    surgicalOperations: Record<
        string,
        (
            input: any,
            portfolio: RealWorldAssetsState
        ) => void
    >
) {
    const allOperationsAreSurgical =
        strand.operations.filter(op => surgicalOperations[op.type] === undefined)
            .length === 0;
    logger.debug(`All operations are surgical: ${allOperationsAreSurgical}`);
    return allOperationsAreSurgical;
}

export function getState() {
    return listenerState;
}