import { createAction } from '../../../document';
import { AccountInput, Account, createAccount } from '../../custom';

import {
    ADD_ACCOUNT,
    AddAccountAction,
    DELETE_ACCOUNT,
    DeleteAccountAction,
    UPDATE_ACCOUNT,
    UpdateAccountAction,
} from './types';

export const addAccount = (accounts: AccountInput[]) =>
    createAction<AddAccountAction>(ADD_ACCOUNT, {
        accounts: accounts.map(createAccount),
    });

export const updateAccount = (accounts: AccountInput[]) =>
    createAction<UpdateAccountAction>(UPDATE_ACCOUNT, { accounts });

export const deleteAccount = (accounts: Account['address'][]) =>
    createAction<DeleteAccountAction>(DELETE_ACCOUNT, { accounts });
