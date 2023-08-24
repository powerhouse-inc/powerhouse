import { createAction } from '../../../document/utils';

import {
    AddAccountInput,
    UpdateAccountInput,
    DeleteAccountInput,
    SortAccountsInput,
} from '../types';
import {
    AddAccountAction,
    UpdateAccountAction,
    DeleteAccountAction,
    SortAccountsAction,
} from './actions';

export const addAccount = (input: AddAccountInput) =>
    createAction<AddAccountAction>(
        'ADD_ACCOUNT',
        {...input}
    );

export const updateAccount = (input: UpdateAccountInput) =>
    createAction<UpdateAccountAction>(
        'UPDATE_ACCOUNT',
        {...input}
    );

export const deleteAccount = (input: DeleteAccountInput) =>
    createAction<DeleteAccountAction>(
        'DELETE_ACCOUNT',
        {...input}
    );

export const sortAccounts = (input: SortAccountsInput) =>
    createAction<SortAccountsAction>(
        'SORT_ACCOUNTS',
        {...input}
    );


