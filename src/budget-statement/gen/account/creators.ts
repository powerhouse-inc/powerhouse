import { createAction } from '../../../document';
import { Account, AccountInput, createAccount } from '../../custom';

import {
    AddAccountAction,
    ADD_ACCOUNT,
    DeleteAccountAction,
    DELETE_ACCOUNT,
    UpdateAccountAction,
    UPDATE_ACCOUNT,
} from './types';

export const addAccount = (accounts: AccountInput[]) =>
    createAction<AddAccountAction>(ADD_ACCOUNT, {
        accounts: accounts.map(createAccount),
    });

export const updateAccount = (accounts: AccountInput[]) =>
    createAction<UpdateAccountAction>(UPDATE_ACCOUNT, { accounts });

export const deleteAccount = (accounts: Account['address'][]) =>
    createAction<DeleteAccountAction>(DELETE_ACCOUNT, { accounts });
