/**
 * {@link moduleA!}
 * {@link "with!bang and \"quoted path\""!}
 */

import { createAction } from '../../../document/utils';
import { Account, AccountInput } from '../../custom';
import { createAccount } from '../../custom/utils';

import {
    AddAccountAction,
    ADD_ACCOUNT,
    DeleteAccountAction,
    DELETE_ACCOUNT,
    UpdateAccountAction,
    UPDATE_ACCOUNT,
} from './types';

/**
 * Action creator for adding accounts to the budget statement.
 * @param accounts Array of account inputs to be added.
 * @group Account
 */
export const addAccount = (accounts: AccountInput[]) =>
    createAction<AddAccountAction>(ADD_ACCOUNT, {
        accounts: accounts.map(createAccount),
    });

/**
 * Action creator for updating accounts in the budget statement.
 * @param accounts Array of account inputs to be updated.
 * @group Account
 */
export const updateAccount = (accounts: AccountInput[]) =>
    createAction<UpdateAccountAction>(UPDATE_ACCOUNT, { accounts });

/**
 * Action creator for deleting accounts from the budget statement.
 * @param accounts Array of addresses of the accounts to be deleted.
 * @group Account
 */
export const deleteAccount = (accounts: Account['address'][]) =>
    createAction<DeleteAccountAction>(DELETE_ACCOUNT, { accounts });
