import {
    AccountUpdateInput,
    SortAccountsAction,
    z,
} from '@acaldas/document-model-graphql/budget-statement';
import { createAction } from '../../../document/utils';
import { Account, AccountInput } from '../../custom';
import { createAccount } from '../../custom/utils';

import {
    AddAccountAction,
    ADD_ACCOUNT,
    DeleteAccountAction,
    DELETE_ACCOUNT,
    SORT_ACCOUNTS,
    UpdateAccountAction,
    UPDATE_ACCOUNT,
} from './types';

/**
 * Action creator for adding accounts to the budget statement.
 * @param accounts Array of account inputs to be added.
 * @group Account
 */
export const addAccount = (accounts: AccountInput[]) =>
    createAction<AddAccountAction>(
        ADD_ACCOUNT,
        {
            accounts: accounts.map(createAccount),
        },
        undefined,
        z.AddAccountActionSchema
    );

/**
 * Action creator for updating accounts in the budget statement.
 * @param accounts Array of account inputs to be updated.
 * @group Account
 */
export const updateAccount = (accounts: AccountUpdateInput[]) =>
    createAction<UpdateAccountAction>(
        UPDATE_ACCOUNT,
        { accounts },
        undefined,
        z.UpdateAccountActionSchema
    );

/**
 * Action creator for deleting accounts from the budget statement.
 * @param accounts Array of addresses of the accounts to be deleted.
 * @group Account
 */
export const deleteAccount = (accounts: Account['address'][]) =>
    createAction<DeleteAccountAction>(
        DELETE_ACCOUNT,
        { accounts },
        undefined,
        z.DeleteAccountActionSchema
    );

/**
 * Action creator for sorting accounts in the budget statement.
 * @param accounts Array of addresses of the accounts to sort.
 * @group Account
 */
export const sortAccounts = (accounts: Account['address'][]) =>
    createAction<SortAccountsAction>(
        SORT_ACCOUNTS,
        { accounts },
        undefined,
        z.SortAccountsActionSchema
    );
