import { createAction } from '../../../document/utils';


import {
    SetOwnerInput,
    SetMonthInput,
    SetFtesInput,
    SetQuoteCurrencyInput,
} from '@acaldas/document-model-graphql/budget-statement';

import {
    SetOwnerAction,
    SetMonthAction,
    SetFtesAction,
    SetQuoteCurrencyAction,
} from './actions';

export const setOwner = (input: SetOwnerInput) =>
    createAction<SetOwnerAction>(
        'SET_OWNER',
        {...input}
    );

export const setMonth = (input: SetMonthInput) =>
    createAction<SetMonthAction>(
        'SET_MONTH',
        {...input}
    );

export const setFtes = (input: SetFtesInput) =>
    createAction<SetFtesAction>(
        'SET_FTES',
        {...input}
    );

export const setQuoteCurrency = (input: SetQuoteCurrencyInput) =>
    createAction<SetQuoteCurrencyAction>(
        'SET_QUOTE_CURRENCY',
        {...input}
    );


