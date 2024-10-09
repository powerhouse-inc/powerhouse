import {
    Account,
    AccountFormInputs,
    ASSET_PURCHASE,
    ASSET_SALE,
    AssetFormInputs,
    BaseTransaction,
    FixedIncome,
    FixedIncomeType,
    FixedIncomeTypeFormInputs,
    GroupTransaction,
    GroupTransactionFormInputs,
    isCashAsset,
    ServiceProviderFeeType,
    ServiceProviderFeeTypeFormInputs,
    SPV,
    SPVFormInputs,
    EditorDispatcher,
} from '@powerhousedao/design-system';
import { copy } from 'copy-anything';
import {
    addFeesToGroupTransaction,
    createGroupTransaction,
    editGroupTransaction,
    editGroupTransactionFees,
    removeFeesFromGroupTransaction,
} from '../../../document-models/real-world-assets/gen/creators';
import diff from 'microdiff';
import { useCallback } from 'react';
import { verifyTransactionFeeFields } from '../utils';
import { ActionErrorCallback, BaseAction } from 'document-model/document';
import { utils } from 'document-model/document';
import {
    RealWorldAssetsAction,
    getDifferences,
    EditTransactionFeeInput,
    validateTransactionFees,
    actions,
    isFixedIncomeAsset,
    RealWorldAssetsState,
} from '../../../document-models/real-world-assets';

type Args = {
    state: RealWorldAssetsState;
    dispatch: (
        action: RealWorldAssetsAction | BaseAction,
        onErrorCallback?: ActionErrorCallback,
    ) => void;
};

export function useEditorDispatcher(args: Args) {
    const { dispatch, state } = args;
    const {
        portfolio,
        transactions,
        accounts,
        spvs,
        serviceProviderFeeTypes,
        fixedIncomeTypes,
        principalLenderAccountId,
    } = state;

    const createAsset = useCallback(
        (data: AssetFormInputs): FixedIncome => {
            const id = utils.hashKey();
            const name = data.name ?? null;
            const maturity = data.maturity
                ? new Date(data.maturity).toISOString()
                : null;
            const fixedIncomeTypeId = data.fixedIncomeTypeId ?? null;
            const spvId = data.spvId ?? null;
            const CUSIP = data.CUSIP ?? null;
            const ISIN = data.ISIN ?? null;
            const coupon = data.coupon ?? null;

            if (!name) throw new Error('Name is required');
            if (!fixedIncomeTypeId)
                throw new Error('Fixed income type is required');
            if (!spvId) throw new Error('SPV is required');

            const newAsset = {
                type: 'FixedIncome' as const,
                id,
                name,
                maturity,
                fixedIncomeTypeId,
                spvId,
                CUSIP,
                ISIN,
                coupon,
                // the following values are all derived from underlying fixed income transactions
                // and are set to 0 by default
                purchasePrice: 0,
                totalDiscount: 0,
                notional: 0,
                purchaseDate: '',
                purchaseProceeds: 0,
                assetProceeds: 0,
                salesProceeds: 0,
                realizedSurplus: 0,
            };

            dispatch(actions.createFixedIncomeAsset(newAsset));

            return newAsset;
        },
        [dispatch],
    );

    const createTransaction = useCallback(
        (data: GroupTransactionFormInputs): GroupTransaction => {
            const createNewGroupTransactionFromFormInputs = (
                data: GroupTransactionFormInputs,
            ) => {
                const cashAssetId = portfolio.find(isCashAsset)!.id;
                const cashAmount = data.cashAmount ?? null;
                const fixedIncomeId = data.fixedIncomeId ?? null;
                const fixedIncomeAmount = data.fixedIncomeAmount ?? null;
                const type = data.type ?? null;
                const txRef = data.txRef ?? null;
                const serviceProviderFeeTypeId =
                    data.serviceProviderFeeTypeId ?? null;
                if (!type) throw new Error('Type is required');
                if (!data.entryTime) throw new Error('Entry time is required');
                if (!cashAmount) {
                    throw new Error('Cash amount is required');
                }
                const isFixedIncomeAssetTransaction = [
                    ASSET_PURCHASE,
                    ASSET_SALE,
                ].includes(type);

                const entryTime = new Date(data.entryTime).toISOString();

                const fees = data.fees?.length
                    ? data.fees.map((fee) => ({
                          ...fee,
                          id: utils.hashKey(),
                      }))
                    : null;

                if (fees) {
                    verifyTransactionFeeFields(fees);
                }

                const cashTransaction = {
                    id: utils.hashKey(),
                    assetType: 'Cash' as const,
                    assetId: cashAssetId,
                    entryTime,
                    counterPartyAccountId: principalLenderAccountId,
                    amount: cashAmount,
                    accountId: null,
                    settlementTime: null,
                    tradeTime: null,
                };

                if (isFixedIncomeAssetTransaction && !fixedIncomeAmount) {
                    throw new Error('Fixed income  amount is required');
                }
                if (isFixedIncomeAssetTransaction && !fixedIncomeId) {
                    throw new Error('Fixed income  ID is required');
                }
                const fixedIncomeTransaction =
                    isFixedIncomeAssetTransaction &&
                    fixedIncomeId &&
                    fixedIncomeAmount
                        ? {
                              id: utils.hashKey(),
                              assetType: 'FixedIncome' as const,
                              assetId: fixedIncomeId,
                              amount: fixedIncomeAmount,
                              entryTime,
                              accountId: null,
                              counterPartyAccountId: null,
                              settlementTime: null,
                              tradeTime: null,
                          }
                        : null;

                const groupTransaction = {
                    id: utils.hashKey(),
                    type,
                    entryTime,
                    fees,
                    txRef,
                    serviceProviderFeeTypeId,
                    cashTransaction,
                    fixedIncomeTransaction,
                    interestTransaction: null,
                    feeTransactions: null,
                    cashBalanceChange: 0,
                    unitPrice: null,
                };
                return groupTransaction;
            };
            const newTransaction =
                createNewGroupTransactionFromFormInputs(data);

            dispatch(createGroupTransaction(newTransaction));

            return newTransaction;
        },
        [dispatch, portfolio, principalLenderAccountId],
    );

    const createAccount = useCallback(
        (data: AccountFormInputs): Account => {
            const id = utils.hashKey();
            const reference = data.reference ?? null;
            const label = data.label ?? null;
            if (!reference) throw new Error('Reference is required');

            const newAccount = {
                id,
                reference,
                label,
            };

            dispatch(actions.createAccount(newAccount));

            return newAccount;
        },
        [dispatch],
    );
    const createFixedIncomeType = useCallback(
        (data: FixedIncomeTypeFormInputs): FixedIncomeType => {
            const id = utils.hashKey();
            const name = data.name;

            if (!name) throw new Error('Name is required');

            const newFixedIncomeType = { id, name };

            dispatch(actions.createFixedIncomeType(newFixedIncomeType));

            return newFixedIncomeType;
        },
        [dispatch],
    );
    const createServiceProviderFeeType = useCallback(
        (data: ServiceProviderFeeTypeFormInputs): ServiceProviderFeeType => {
            const id = utils.hashKey();
            const name = data.name;
            const accountId = data.accountId;
            const feeType = data.feeType;

            if (!name) throw new Error('Name is required');
            if (!accountId) throw new Error('Account is required');
            if (!feeType) throw new Error('Fee Type is required');

            const newServiceProviderFeeType = {
                id,
                name,
                accountId,
                feeType,
            };
            dispatch(
                actions.createServiceProviderFeeType(newServiceProviderFeeType),
            );

            return newServiceProviderFeeType;
        },
        [dispatch],
    );
    const createSPV = useCallback(
        (data: SPVFormInputs): SPV => {
            const id = utils.hashKey();
            const name = data.name;

            if (!name) throw new Error('Name is required');

            const newSPV = {
                id,
                name,
            };

            dispatch(actions.createSpv(newSPV));

            return newSPV;
        },
        [dispatch],
    );

    const editAsset = useCallback(
        (data: AssetFormInputs): FixedIncome | undefined => {
            const selectedItem = portfolio.find((f) => f.id === data.id);
            if (!selectedItem || !isFixedIncomeAsset(selectedItem)) return;
            const update = copy(selectedItem);
            const newName = data.name ?? null;
            const newMaturity = data.maturity
                ? new Date(data.maturity).toISOString()
                : null;
            const fixedIncomeTypeId = data.fixedIncomeTypeId ?? null;
            const newSpvId = data.spvId ?? null;
            const newCUSIP = data.CUSIP ?? null;
            const newISIN = data.ISIN ?? null;
            const newCoupon = data.coupon ?? null;

            if (newName) update.name = newName;
            if (newMaturity) update.maturity = newMaturity;
            if (fixedIncomeTypeId) update.fixedIncomeTypeId = fixedIncomeTypeId;
            if (newSpvId) update.spvId = newSpvId;
            if (newCUSIP) update.CUSIP = newCUSIP;
            if (newISIN) update.ISIN = newISIN;
            if (newCoupon) update.coupon = newCoupon;

            const changedFields = getDifferences(selectedItem, update);

            if (Object.values(changedFields).filter(Boolean).length === 0) {
                return;
            }

            const newAsset = {
                ...changedFields,
                id: selectedItem.id,
            };

            dispatch(actions.editFixedIncomeAsset(newAsset));

            return {
                ...selectedItem,
                ...changedFields,
            };
        },
        [dispatch, portfolio],
    );

    const editTransaction = useCallback(
        (data: GroupTransactionFormInputs): GroupTransaction | undefined => {
            const selectedItem = transactions.find((t) => t.id === data.id);
            if (!selectedItem) return;
            const handleFeeUpdates = (
                feeInputs: EditTransactionFeeInput[] | null | undefined,
                transaction: GroupTransaction,
            ) => {
                const existingFees = transaction.fees;

                // if there are no existing fees and no fees to update, we do nothing
                if (!existingFees?.length && !feeInputs?.length) return;

                // if there are existing fees and the update is empty, then we remove all fees
                if (existingFees?.length && !feeInputs?.length) {
                    dispatch(
                        removeFeesFromGroupTransaction({
                            id: transaction.id,
                            feeIds: existingFees.map((fee) => fee.id),
                        }),
                    );
                    return;
                }

                // once we have handled the edge cases, we can assume that there are fees to update
                if (!feeInputs) {
                    throw new Error('Fees are required');
                }

                const feeUpdates = feeInputs.map((fee) => ({
                    ...fee,
                    id: fee.id ?? utils.hashKey(),
                    amount: Number(fee.amount),
                }));

                if (!existingFees?.length) {
                    validateTransactionFees(state, feeUpdates);
                    dispatch(
                        addFeesToGroupTransaction({
                            id: transaction.id,
                            fees: feeUpdates,
                        }),
                    );
                    return;
                }
                const feeDifferences = diff(existingFees, feeInputs);

                const newFeesToCreate: EditTransactionFeeInput[] = [];
                const feesToUpdate: EditTransactionFeeInput[] = [];
                const feeIdsToRemove: string[] = [];

                feeDifferences.forEach((difference) => {
                    if (
                        difference.type === 'CREATE' &&
                        !existingFees.find(
                            (fee) =>
                                fee.id ===
                                feeUpdates[difference.path[0] as number].id,
                        )
                    ) {
                        newFeesToCreate.push(
                            feeUpdates[difference.path[0] as number],
                        );
                    }
                    if (difference.type === 'REMOVE') {
                        feeIdsToRemove.push(
                            existingFees[difference.path[0] as number].id,
                        );
                    }
                    if (difference.type === 'CHANGE') {
                        feesToUpdate.push(
                            feeUpdates[difference.path[0] as number],
                        );
                    }
                });

                if (newFeesToCreate.length) {
                    validateTransactionFees(state, newFeesToCreate);
                    dispatch(
                        addFeesToGroupTransaction({
                            id: transaction.id,
                            fees: newFeesToCreate,
                        }),
                    );
                }
                if (feesToUpdate.length) {
                    dispatch(
                        editGroupTransactionFees({
                            id: transaction.id,
                            fees: feesToUpdate,
                        }),
                    );
                }
                if (feeIdsToRemove.length) {
                    dispatch(
                        removeFeesFromGroupTransaction({
                            id: transaction.id,
                            feeIds: feeIdsToRemove,
                        }),
                    );
                }
            };
            const newEntryTime = data.entryTime
                ? new Date(data.entryTime).toISOString()
                : null;
            const newType = data.type ?? null;
            const newFixedIncomeAssetId = data.fixedIncomeId ?? null;
            const newFixedIncomeAssetAmount = data.fixedIncomeAmount ?? null;
            const newCashAmount = data.cashAmount ?? null;
            const newTxRef = data.txRef ?? null;
            const newServiceProviderFeeTypeId =
                data.serviceProviderFeeTypeId ?? null;

            const existingCashTransaction = selectedItem.cashTransaction;

            const existingFixedIncomeTransaction =
                selectedItem.fixedIncomeTransaction;

            const update = copy(selectedItem);

            if (newType) {
                update.type = newType;
            }

            if (newEntryTime) {
                update.entryTime = newEntryTime;
            }

            if (newTxRef) {
                update.txRef = newTxRef;
            }

            if (newServiceProviderFeeTypeId) {
                update.serviceProviderFeeTypeId = newServiceProviderFeeTypeId;
            }

            // use type comparison to avoid false positives on zero
            if (typeof newCashAmount === 'number') {
                if (!update.cashTransaction) {
                    throw new Error('Cash transaction does not exist');
                }
                update.cashTransaction.amount = newCashAmount;
            }

            if (newFixedIncomeAssetId) {
                if (!update.fixedIncomeTransaction) {
                    throw new Error('Fixed income transaction does not exist');
                }
                update.fixedIncomeTransaction.assetId = newFixedIncomeAssetId;
            }

            // use direct comparison to avoid false positives on zero
            if (typeof newFixedIncomeAssetAmount === 'number') {
                if (!update.fixedIncomeTransaction) {
                    throw new Error('Fixed income transaction does not exist');
                }
                update.fixedIncomeTransaction.amount =
                    newFixedIncomeAssetAmount;
            }

            let changedFields = getDifferences(selectedItem, update);

            if ('fixedIncomeTransaction' in changedFields) {
                if (!existingFixedIncomeTransaction) {
                    throw new Error('Fixed income transaction does not exist');
                }
                const fixedIncomeTransactionChangedFields = getDifferences(
                    existingFixedIncomeTransaction,
                    update.fixedIncomeTransaction,
                ) as BaseTransaction;

                changedFields = {
                    ...changedFields,
                    fixedIncomeTransaction: {
                        ...fixedIncomeTransactionChangedFields,
                        id: existingFixedIncomeTransaction.id,
                    },
                };
            }

            if ('cashTransaction' in changedFields) {
                if (!existingCashTransaction) {
                    throw new Error('Cash transaction does not exist');
                }
                const cashTransactionChangedFields = getDifferences(
                    existingCashTransaction,
                    update.cashTransaction,
                ) as BaseTransaction;

                changedFields = {
                    ...changedFields,
                    cashTransaction: {
                        ...cashTransactionChangedFields,
                        id: existingCashTransaction.id,
                    },
                };
            }

            if (data.fees) {
                handleFeeUpdates(data.fees, update);
            }

            if (Object.keys(changedFields).length === 0) {
                return;
            }

            const newTransaction = {
                ...changedFields,
                id: selectedItem.id,
            };

            dispatch(editGroupTransaction(newTransaction));

            return {
                ...selectedItem,
                ...changedFields,
            };
        },
        [dispatch, serviceProviderFeeTypes, transactions],
    );

    const editAccount = useCallback(
        (data: AccountFormInputs): Account | undefined => {
            const selectedItem = accounts.find((a) => a.id === data.id);
            if (!selectedItem) return;

            const update = copy(selectedItem);
            const newReference = data.reference;
            const newLabel = data.label;

            if (newReference) update.reference = newReference;
            if (newLabel) update.label = newLabel;

            const changedFields = getDifferences(selectedItem, update);

            if (Object.values(changedFields).filter(Boolean).length === 0) {
                return;
            }

            const newAccount = {
                ...changedFields,
                id: selectedItem.id,
            };

            dispatch(actions.editAccount(newAccount));

            return {
                ...selectedItem,
                ...changedFields,
            };
        },
        [dispatch, accounts],
    );

    const editFixedIncomeType = useCallback(
        (data: FixedIncomeTypeFormInputs): FixedIncomeType | undefined => {
            const selectedItem = fixedIncomeTypes.find((f) => f.id === data.id);
            if (!selectedItem) return;

            const update = copy(selectedItem);
            const newName = data.name;

            if (newName) update.name = newName;

            const changedFields = getDifferences(selectedItem, update);

            if (Object.values(changedFields).filter(Boolean).length === 0) {
                return;
            }

            const newFixedIncomeType = {
                ...changedFields,
                id: selectedItem.id,
            };

            dispatch(actions.editFixedIncomeType(newFixedIncomeType));

            return {
                ...selectedItem,
                ...changedFields,
            };
        },
        [dispatch, fixedIncomeTypes],
    );

    const editServiceProviderFeeType = useCallback(
        (
            data: ServiceProviderFeeTypeFormInputs,
        ): ServiceProviderFeeType | undefined => {
            const selectedItem = serviceProviderFeeTypes.find(
                (s) => s.id === data.id,
            );
            if (!selectedItem) return;

            const update = copy(selectedItem);
            const newName = data.name;
            const newAccountId = data.accountId;
            const newFeeType = data.feeType;

            if (newName) update.name = newName;
            if (newAccountId) update.accountId = newAccountId;
            if (newFeeType) update.feeType = newFeeType;

            const changedFields = getDifferences(selectedItem, update);

            if (Object.values(changedFields).filter(Boolean).length === 0) {
                return;
            }

            const newServiceProviderFeeType = {
                ...changedFields,
                id: selectedItem.id,
            };

            dispatch(
                actions.editServiceProviderFeeType(newServiceProviderFeeType),
            );

            return {
                ...selectedItem,
                ...changedFields,
            };
        },
        [dispatch, serviceProviderFeeTypes],
    );

    const editSPV = useCallback(
        (data: SPVFormInputs): SPV | undefined => {
            const selectedItem = spvs.find((s) => s.id === data.id);
            if (!selectedItem) return;

            const update = copy(selectedItem);
            const newName = data.name;

            if (newName) update.name = newName;

            const changedFields = getDifferences(selectedItem, update);

            if (Object.values(changedFields).filter(Boolean).length === 0) {
                return;
            }

            const newSPV = {
                ...changedFields,
                id: selectedItem.id,
            };

            dispatch(actions.editSpv(newSPV));

            return {
                ...selectedItem,
                ...changedFields,
            };
        },
        [dispatch, spvs],
    );

    const editorDispatcher = useCallback(
        (action) => {
            try {
                switch (action.type) {
                    case 'CREATE_ASSET': {
                        const newAsset = createAsset(action.payload);
                        return newAsset;
                    }
                    case 'CREATE_TRANSACTION': {
                        const newTransaction = createTransaction(
                            action.payload,
                        );
                        return newTransaction;
                    }
                    case 'CREATE_ACCOUNT': {
                        const newAccount = createAccount(action.payload);
                        return newAccount;
                    }
                    case 'CREATE_FIXED_INCOME_TYPE': {
                        const newFixedIncomeType = createFixedIncomeType(
                            action.payload,
                        );
                        return newFixedIncomeType;
                    }
                    case 'CREATE_SERVICE_PROVIDER_FEE_TYPE': {
                        const newServiceProviderFeeType =
                            createServiceProviderFeeType(action.payload);
                        return newServiceProviderFeeType;
                    }
                    case 'CREATE_SPV': {
                        const newSPV = createSPV(action.payload);
                        return newSPV;
                    }
                    case 'EDIT_ASSET': {
                        const newAsset = editAsset(action.payload);
                        if (newAsset) {
                            return newAsset;
                        }
                        break;
                    }
                    case 'EDIT_TRANSACTION': {
                        const newTransaction = editTransaction(action.payload);
                        if (newTransaction) {
                            return newTransaction;
                        }
                        break;
                    }
                    case 'EDIT_ACCOUNT': {
                        const newAccount = editAccount(action.payload);
                        if (newAccount) {
                            return newAccount;
                        }
                        break;
                    }
                    case 'EDIT_FIXED_INCOME_TYPE': {
                        const newFixedIncomeType = editFixedIncomeType(
                            action.payload,
                        );
                        if (newFixedIncomeType) {
                            return newFixedIncomeType;
                        }
                        break;
                    }
                    case 'EDIT_SERVICE_PROVIDER_FEE_TYPE': {
                        const newServiceProviderFeeType =
                            editServiceProviderFeeType(action.payload);
                        if (newServiceProviderFeeType) {
                            return newServiceProviderFeeType;
                        }
                        break;
                    }
                    case 'EDIT_SPV': {
                        const newSPV = editSPV(action.payload);
                        if (newSPV) {
                            return newSPV;
                        }
                        break;
                    }
                    case 'DELETE_ASSET': {
                        dispatch({
                            type: 'DELETE_FIXED_INCOME_ASSET',
                            input: action.payload,
                            scope: 'global',
                        });
                        break;
                    }
                    case 'DELETE_TRANSACTION': {
                        dispatch({
                            type: 'DELETE_GROUP_TRANSACTION',
                            input: action.payload,
                            scope: 'global',
                        });
                        break;
                    }
                    case 'DELETE_ACCOUNT': {
                        dispatch({
                            type: 'DELETE_ACCOUNT',
                            input: action.payload,
                            scope: 'global',
                        });
                        break;
                    }
                    case 'DELETE_FIXED_INCOME_TYPE': {
                        dispatch({
                            type: 'DELETE_FIXED_INCOME_TYPE',
                            input: action.payload,
                            scope: 'global',
                        });
                        break;
                    }
                    case 'DELETE_SERVICE_PROVIDER_FEE_TYPE': {
                        dispatch({
                            type: 'DELETE_SERVICE_PROVIDER_FEE_TYPE',
                            input: action.payload,
                            scope: 'global',
                        });
                        break;
                    }
                    case 'DELETE_SPV': {
                        dispatch({
                            type: 'DELETE_SPV',
                            input: action.payload,
                            scope: 'global',
                        });
                        break;
                    }
                    default:
                        break;
                }
            } catch (error) {
                console.error(error);
            }
        },
        [
            createAccount,
            createAsset,
            createFixedIncomeType,
            createSPV,
            createServiceProviderFeeType,
            createTransaction,
            dispatch,
            editAccount,
            editAsset,
            editFixedIncomeType,
            editSPV,
            editServiceProviderFeeType,
            editTransaction,
        ],
    ) as EditorDispatcher;

    return editorDispatcher;
}
