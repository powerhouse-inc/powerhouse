import {
    SnapshotAccount,
    ActualsComparison,
    AccountSnapshotState,
} from '../../document-models/account-snapshot';
import { Snapshots, Token, AccountType } from 'dspot-powerhouse-components';

const stateToActualsComparison = (
    state: ActualsComparison[],
): Snapshots['actualsComparison'] =>
    state.map(comparasion => ({
        currency: comparasion?.currency as Token,
        month: '' as string,
        reportedActuals: comparasion?.reportedActuals || 0,
        netExpenses: {
            offChainIncluded: {
                amount: comparasion?.netExpenses?.offChainIncluded?.amount || 0,
                difference:
                    comparasion?.netExpenses?.offChainIncluded?.difference || 0,
            },
            onChainOnly: {
                amount: comparasion?.netExpenses?.onChainOnly?.amount || 0,
                difference:
                    comparasion?.netExpenses?.onChainOnly?.difference || 0,
            },
        },
    }));

const stateToSnapshotAccount = (
    state: SnapshotAccount[],
): Snapshots['snapshotAccount'] =>
    state.map(snapshot => ({
        id: snapshot.id,
        accountType: snapshot.accountType as AccountType,
        accountLabel: snapshot.accountLabel || '',
        offChain: !!snapshot.offChain,
        accountAddress: snapshot.accountAddress || '',
        groupAccountId: snapshot.groupAccountId || '',
        upstreamAccountId: snapshot.upstreamAccountId || '',
        snapshotAccountTransaction: (
            snapshot.snapshotAccountTransaction || []
        ).map(tx => ({
            id: tx?.id || '',
            timestamp: tx?.timestamp || '',
            txHash: tx?.txHash || '',
            txLabel: tx?.txLabel || null,
            token: tx?.token as Token,
            counterParty: tx?.counterParty || '',
            counterPartyName: tx?.counterPartyName || null,
            amount: tx?.amount || 0,
        })),
        snapshotAccountBalance: (snapshot.snapshotAccountBalance || []).map(
            balance => ({
                id: balance?.id || '',
                token: balance?.token as Token,
                initialBalance: balance?.initialBalance || 0,
                newBalance: balance?.newBalance || 0,
                inflow: balance?.inflow || 0,
                outflow: balance?.outflow || 0,
                includesOffChain: balance?.includesOffChain ?? null,
            }),
        ),
    }));

export const accountSnapshotStateToSnapshot = (
    state: AccountSnapshotState,
): Snapshots => {
    return {
        id: state.id,
        end: state.end,
        start: state.start,
        ownerId: state.ownerId || '',
        period: state.period || '',
        ownerType: state.ownerType || '',
        actualsComparison: stateToActualsComparison(
            (state.actualsComparison as ActualsComparison[]) || [],
        ),
        snapshotAccount: stateToSnapshotAccount(
            (state.snapshotAccount as SnapshotAccount[]) || [],
        ),
    };
};
