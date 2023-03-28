import { createAction } from '../../../document/utils';
import { Account } from '../../custom';
import {
    RequestTopupAction,
    REQUEST_TOPUP,
    TransferTopupAction,
    TRANSFER_TOPUP,
} from './types';

/**
 * Action creator for requesting a top-up for an account.
 *
 * @param account - The address of the account to top-up.
 * @param value - The amount to top-up the account by.
 *
 * @group Topup
 */
export const requestTopup = (account: Account['address'], value: number) =>
    createAction<RequestTopupAction>(REQUEST_TOPUP, { account, value });

/**
 * Action creator for transferring top-up to an account.
 *
 * @param account - The address of the account to transfer top-up to.
 * @param value - The amount of top-up to transfer.
 * @param transaction - The transaction ID of the transfer.
 *
 * @group Topup
 */
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
