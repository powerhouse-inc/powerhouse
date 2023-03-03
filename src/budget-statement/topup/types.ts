import { Action } from '../../document';

export const REQUEST_TOPUP = 'REQUEST_TOPUP';
export const TRANSFER_TOPUP = 'TRANSFER_TOPUP';

export interface RequestTopupAction extends Action {
    type: typeof REQUEST_TOPUP;
}

export interface TransferTopupAction extends Action {
    type: typeof TRANSFER_TOPUP;
}

export type BudgetStatementTopupAction =
    | RequestTopupAction
    | TransferTopupAction;
