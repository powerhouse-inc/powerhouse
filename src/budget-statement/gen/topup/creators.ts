import { createAction } from '../../../document';
import { Account } from '../../custom';
import {
    RequestTopupAction,
    REQUEST_TOPUP,
    TransferTopupAction,
    TRANSFER_TOPUP,
} from './types';

export const requestTopup = (account: Account['address'], value: number) =>
    createAction<RequestTopupAction>(REQUEST_TOPUP, { account, value });

export const transferTopup = (
    account: Account['address'],
    value: number,
    transaction: string
) =>
    createAction<TransferTopupAction>(TRANSFER_TOPUP, {
        account,
        value,
        transaction,
    });
