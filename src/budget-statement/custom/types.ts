import type {
    Account,
    AccountInput,
    AddAuditReportInput,
    AuditReport,
    AuditReportStatus,
    BudgetStatementAction,
    BudgetStatementData,
    BudgetStatus,
    Comment,
    CommentInput,
    Ftes,
    FtesInput,
    LineItem,
    LineItemInput,
    Owner,
    OwnerInput,
    Vesting,
    VestingInput,
    VestingUpdateInput,
} from '@acaldas/document-model-graphql/budget-statement';
import { Document, ExtendedState } from '../../document/types';

export type {
    Account,
    AccountInput,
    LineItem,
    LineItemInput,
    BudgetStatus,
    AuditReportStatus,
    AuditReport,
    Comment,
    CommentInput,
    Vesting,
    VestingInput,
    VestingUpdateInput,
    AddAuditReportInput,
    Owner,
    OwnerInput,
    Ftes,
    FtesInput,
};
export { types, BudgetStatementAction };

/**
 * Represents the state of a budget statement.
 */
export type BudgetStatementState = BudgetStatementData;

/**
 * Represents a budget statement document, which extends the base Document type.
 */
export type BudgetStatementDocument = Document<
    BudgetStatementState,
    BudgetStatementAction
>;

import type * as types from '@acaldas/document-model-graphql/document-model';

export type ExtendedBudgetStatementState = ExtendedState<BudgetStatementState>;
