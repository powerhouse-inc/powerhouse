import { z } from '@acaldas/document-model-graphql/budget-statement';
import { createAction } from '../../../document/utils';
import { FtesInput, OwnerInput } from '../../custom';
import {
    SetFtesAction,
    SetMonthAction,
    SetOwnerAction,
    SetQuoteCurrencyAction,
    SET_FTES,
    SET_MONTH,
    SET_OWNER,
    SET_QUOTE_CURRENCY,
} from './types';

export const setOwner = (owner: OwnerInput) =>
    createAction<SetOwnerAction>(SET_OWNER, owner, z.SetOwnerActionSchema);

export const setMonth = (month: string) =>
    createAction<SetMonthAction>(SET_MONTH, month, z.SetMonthActionSchema);

export const setQuoteCurrency = (currency: string) =>
    createAction<SetQuoteCurrencyAction>(
        SET_QUOTE_CURRENCY,
        currency,
        z.SetQuoteCurrencyActionSchema
    );

export const setFtes = (ftes: FtesInput) =>
    createAction<SetFtesAction>(SET_FTES, ftes, z.SetFtesActionSchema);
