import type {
    Account,
    AccountInput,
    AuditReport,
    AuditReportInput,
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
    AuditReportInput,
    Owner,
    OwnerInput,
    Ftes,
    FtesInput,
};
export {
    types,
    ExtendedBudgetStatementState,
    BudgetStatementState,
    BudgetStatementAction,
};

/**
 * Represents the state of a budget statement.
 */
export type State = BudgetStatementData;

/**
 * Represents a budget statement document, which extends the base Document type.
 */
export type BudgetStatementDocument = Document<State, BudgetStatementAction>;

import type * as types from '@acaldas/document-model-graphql/document-model';

type BudgetStatementState = BudgetStatementData;
type ExtendedBudgetStatementState = ExtendedState<BudgetStatementState>;
