/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { Account, ServiceProvider, Spv } from '../..';
import { RealWorldAssetsGeneralOperations } from '../../gen/general/operations';

export const reducer: RealWorldAssetsGeneralOperations = {
    createSpvOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`SPV must have an id`);
        }
        if (!action.input.name) {
            throw new Error(`SPV must have a name`);
        }
        if (state.spvs.find(spv => spv.id === action.input.id)) {
            throw new Error(`SPV with id ${action.input.id} already exists!`);
        }
        state.spvs.push(action.input);
    },
    editSpvOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`SPV must have an id`);
        }
        const spv = state.spvs.find(spv => spv.id === action.input.id);
        if (!spv) {
            throw new Error(`SPV with id ${action.input.id} does not exist!`);
        }
        state.spvs = state.spvs.map(spv =>
            spv.id === action.input.id
                ? ({
                      ...spv,
                      ...action.input,
                  } as Spv)
                : spv,
        );
    },
    deleteSpvOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`SPV must have an id`);
        }
        const spv = state.spvs.find(spv => spv.id === action.input.id);
        if (!spv) {
            throw new Error(`SPV with id ${action.input.id} does not exist!`);
        }
        state.spvs = state.spvs.filter(spv => spv.id !== action.input.id);
    },
    createServiceProviderOperation(state, action, dispatch) {
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
                account => account.id === action.input.accountId,
            )
        ) {
            throw new Error(
                `Account with id ${action.input.accountId} does not exist!`,
            );
        }
        if (state.feeTypes.find(spv => spv.id === action.input.id)) {
            throw new Error(
                `Service provider with id ${action.input.id} already exists!`,
            );
        }
        state.feeTypes.push(action.input);
    },
    editServiceProviderOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`Service provider must have an id`);
        }
        const serviceProvider = state.feeTypes.find(
            feeType => feeType.id === action.input.id,
        );
        if (!serviceProvider) {
            throw new Error(
                `Service provider with id ${action.input.id} does not exist!`,
            );
        }
        if (action.input.accountId) {
            if (
                !state.accounts.find(
                    account => account.id === action.input.accountId,
                )
            ) {
                throw new Error(
                    `Account with id ${action.input.accountId} does not exist!`,
                );
            }
        }
        state.feeTypes = state.feeTypes.map(rsp =>
            rsp.id === action.input.id
                ? ({
                      ...rsp,
                      ...action.input,
                  } as ServiceProvider)
                : rsp,
        );
    },
    deleteServiceProviderOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`Service provider must have an id`);
        }
        const rsp = state.feeTypes.find(rsp => rsp.id === action.input.id);
        if (!rsp) {
            throw new Error(
                `Service provider with id ${action.input.id} does not exist!`,
            );
        }
        state.feeTypes = state.feeTypes.filter(
            rsp => rsp.id !== action.input.id,
        );
    },
    createAccountOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`Account must have an id`);
        }
        if (!action.input.reference) {
            throw new Error(`Account must have a reference`);
        }
        if (state.accounts.find(account => account.id === action.input.id)) {
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
            account => account.id === action.input.id,
        );
        if (!account) {
            throw new Error(
                `Account with id ${action.input.id} does not exist!`,
            );
        }
        state.accounts = state.accounts.map(account =>
            account.id === action.input.id
                ? ({
                      ...account,
                      ...action.input,
                  } as Account)
                : account,
        );
    },
    deleteAccountOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`Account must have an id`);
        }
        const account = state.accounts.find(
            account => account.id === action.input.id,
        );
        if (!account) {
            throw new Error(
                `Account with id ${action.input.id} does not exist!`,
            );
        }
        state.accounts = state.accounts.filter(
            account => account.id !== action.input.id,
        );
    },
};
