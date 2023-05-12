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
} from '@acaldas/document-model-graphql/budget-statement';
import { Document } from '../../document/types';

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
    AuditReportInput,
    Owner,
    OwnerInput,
    Ftes,
    FtesInput,
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
