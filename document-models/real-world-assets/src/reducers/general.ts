/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { Account, ServiceProviderFeeType, Spv } from '../..';
import { RealWorldAssetsGeneralOperations } from '../../gen/general/operations';

export const reducer: RealWorldAssetsGeneralOperations = {
    createSpvOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`SPV must have an id`);
        }
        if (!action.input.name) {
            throw new Error(`SPV must have a name`);
        }
        if (state.spvs.find((spv) => spv.id === action.input.id)) {
            throw new Error(`SPV with id ${action.input.id} already exists!`);
        }
        state.spvs.push(action.input);
    },
    editSpvOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`SPV must have an id`);
        }
        const spv = state.spvs.find((spv) => spv.id === action.input.id);
        if (!spv) {
            throw new Error(`SPV with id ${action.input.id} does not exist!`);
        }
        state.spvs = state.spvs.map((spv) =>
            spv.id === action.input.id
                ? ({
                      ...spv,
                      ...action.input,
                  } as Spv)
                : spv,
        );
    },
    deleteSpvOperation(state, action, dispatch) {
        const id = action.input.id;

        if (!id) {
            throw new Error(`SPV must have an id`);
        }
        const spv = state.spvs.find((spv) => spv.id === id);
        if (!spv) {
            throw new Error(`SPV with id ${id} does not exist!`);
        }
        const dependentAssets = state.portfolio.filter((a) => a.spvId === id);
        if (dependentAssets.length !== 0) {
            throw new Error(
                'Cannot delete SPV because it has assets that depend on it. Please change or delete those assets first.',
            );
        }
        state.spvs = state.spvs.filter((spv) => spv.id !== id);
    },
    createServiceProviderFeeTypeOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`Service provider must have an id`);
        }
        if (!action.input.name) {
            throw new Error(`Service provider must have a name`);
        }
        if (!action.input.feeType) {
            throw new Error(`Service provider must have a fee type`);
        }
        if (!action.input.accountId) {
            throw new Error(
                `Service provider must have an associated account id`,
            );
        }
        if (
            !state.accounts.find(
                (account) => account.id === action.input.accountId,
            )
        ) {
            throw new Error(
                `Account with id ${action.input.accountId} does not exist!`,
            );
        }
        if (
            state.serviceProviderFeeTypes.find(
                (spft) => spft.id === action.input.id,
            )
        ) {
            throw new Error(
                `Service provider with id ${action.input.id} already exists!`,
            );
        }
        state.serviceProviderFeeTypes.push(action.input);
    },
    editServiceProviderFeeTypeOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`Service provider must have an id`);
        }
        const serviceProviderFeeType = state.serviceProviderFeeTypes.find(
            (feeType) => feeType.id === action.input.id,
        );
        if (!serviceProviderFeeType) {
            throw new Error(
                `Service provider with id ${action.input.id} does not exist!`,
            );
        }
        if (action.input.accountId) {
            if (
                !state.accounts.find(
                    (account) => account.id === action.input.accountId,
                )
            ) {
                throw new Error(
                    `Account with id ${action.input.accountId} does not exist!`,
                );
            }
        }
        state.serviceProviderFeeTypes = state.serviceProviderFeeTypes.map(
            (rsp) =>
                rsp.id === action.input.id
                    ? ({
                          ...rsp,
                          ...action.input,
                      } as ServiceProviderFeeType)
                    : rsp,
        );
    },
    deleteServiceProviderFeeTypeOperation(state, action, dispatch) {
        const id = action.input.id;

        if (!id) {
            throw new Error(`Service provider fee type must have an id`);
        }

        const serviceProviderFeeType = state.serviceProviderFeeTypes.find(
            (s) => s.id === id,
        );
        if (!serviceProviderFeeType) {
            throw new Error(`Service provider with id ${id} does not exist!`);
        }
        const dependentTransactions = state.transactions.filter((t) =>
            t.fees?.some((f) => f.serviceProviderFeeTypeId === id),
        );
        if (dependentTransactions.length !== 0) {
            throw new Error(
                'Cannot delete service provider fee type because it has transactions that depend on it. Please change or delete those transactions first.',
            );
        }
        state.serviceProviderFeeTypes = state.serviceProviderFeeTypes.filter(
            (s) => s.id !== id,
        );
    },
    createAccountOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`Account must have an id`);
        }
        if (!action.input.reference) {
            throw new Error(`Account must have a reference`);
        }
        if (state.accounts.find((account) => account.id === action.input.id)) {
            throw new Error(
                `Account with id ${action.input.id} already exists!`,
            );
        }
        state.accounts.push(action.input as Account);
    },
    editAccountOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`Account must have an id`);
        }
        const account = state.accounts.find(
            (account) => account.id === action.input.id,
        );
        if (!account) {
            throw new Error(
                `Account with id ${action.input.id} does not exist!`,
            );
        }
        state.accounts = state.accounts.map((account) =>
            account.id === action.input.id
                ? ({
                      ...account,
                      ...action.input,
                  } as Account)
                : account,
        );
    },
    deleteAccountOperation(state, action, dispatch) {
        const id = action.input.id;
        if (!id) {
            throw new Error(`Account must have an id`);
        }
        if (id === state.principalLenderAccountId) {
            throw new Error(`Cannot delete principal lender account.`);
        }
        const account = state.accounts.find((account) => account.id === id);
        if (!account) {
            throw new Error(`Account with id ${id} does not exist!`);
        }
        const dependentServiceProviderFeeTypes =
            state.serviceProviderFeeTypes.filter((s) => s.accountId === id);
        if (dependentServiceProviderFeeTypes.length !== 0) {
            throw new Error(
                'Cannot delete account because it has service provider fee types that depend on it. Please change or delete those service provider fee types first.',
            );
        }
        const dependentTransactions = state.transactions.filter(
            (t) =>
                t.fixedIncomeTransaction?.accountId === id ||
                t.cashTransaction.accountId === id,
        );
        if (dependentTransactions.length !== 0) {
            throw new Error(
                'Cannot delete account because it has transactions that depend on it. Please change or delete those transactions first.',
            );
        }
        state.accounts = state.accounts.filter((account) => account.id !== id);
    },
};
