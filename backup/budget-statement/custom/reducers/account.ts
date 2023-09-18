/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { BudgetStatementAccountOperations } from '../../gen/account/operations';
import { createAccount } from '../utils';

export const reducer: BudgetStatementAccountOperations = {
    addAccountOperation(state, action) {
        const { input } = action;
        if (state.accounts.find(account => account.address === input.address)) {
            throw new Error(
                `Account with address ${input.address} already exists!`
            );
        }
        state.accounts.push(createAccount(input));
    },
    updateAccountOperation(state, action) {
        const { input } = action;
        const index = state.accounts.findIndex(
            account => account.address === input.address
        );
        if (index === -1) {
            throw new Error(`Account with adddress ${input.address} not found`);
        }

        const account = state.accounts[index];
        state.accounts[index] = {
            ...account,
            lineItems: input?.lineItems ?? account.lineItems,
            name: input?.name ?? account.name,
        };
    },
    deleteAccountOperation(state, action) {
        const { input } = action;
        state.accounts = state.accounts.filter(
            account => account.address !== input.account
        );
    },
    sortAccountsOperation(state, action) {
        state.accounts.sort((a, b) => {
            const index1 = action.input.accounts.indexOf(a.address);
            const index2 = action.input.accounts.indexOf(b.address);
            return (
                (index1 > -1 ? index1 : Infinity) -
                (index2 > -1 ? index2 : Infinity)
            );
        });
    },
};
