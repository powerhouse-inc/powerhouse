import { Action } from '../../../document';
import { Account } from '../../custom';

export const REQUEST_TOPUP = 'REQUEST_TOPUP';
export const TRANSFER_TOPUP = 'TRANSFER_TOPUP';

export interface RequestTopupAction extends Action {
    type: typeof REQUEST_TOPUP;
    input: {
        account: Account['address'];
        value: number;
    };
}

export interface TransferTopupAction extends Action {
    type: typeof TRANSFER_TOPUP;
    input: {
        account: Account['address'];
        value: number;
        transaction: string;
    };
}

export type BudgetStatementTopupAction =
    | RequestTopupAction
    | TransferTopupAction;
