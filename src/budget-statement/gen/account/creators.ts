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

export const addAccount = (accounts: AccountInput[]) =>
    createAction<AddAccountAction>(ADD_ACCOUNT, {
        accounts: accounts.map(createAccount),
    });

export const updateAccount = (accounts: AccountInput[]) =>
    createAction<UpdateAccountAction>(UPDATE_ACCOUNT, { accounts });

export const deleteAccount = (accounts: Account['address'][]) =>
    createAction<DeleteAccountAction>(DELETE_ACCOUNT, { accounts });
