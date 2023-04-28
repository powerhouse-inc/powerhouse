import { InitAction } from '../../gen/init/types';
import { BudgetStatementDocument } from '../types';
import { createBudgetStatement } from '../utils';

export const initOperation = (
    state: BudgetStatementDocument,
    action: InitAction
): BudgetStatementDocument => {
    return createBudgetStatement({
        ...state,
        ...action.input,
        name: action.input.name ?? state.name,
        revision: action.input.revision ?? state.revision,
        documentType: action.input.documentType ?? state.documentType,
        created: action.input.created ?? state.created,
        lastModified: action.input.lastModified ?? state.lastModified,
        data: {
            owner: {
                ref: action.input.data.owner?.ref || null,
                id: action.input.data.owner?.id || null,
                title: action.input.data.owner?.title || null,
            },
            month: action.input.data.month ?? null,
            quoteCurrency: action.input.data.quoteCurrency ?? null,
            vesting: action.input.data.vesting ?? [],
            ftes: action.input.data.ftes ?? null,
            accounts: action.input.data.accounts ?? [],
            auditReports: action.input.data.auditReports ?? [],
            comments: action.input.data.comments ?? [],
        },
    });
};
