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
    LineItem,
    LineItemInput,
    Vesting,
    VestingInput,
} from 'document-model-graphql/budget-statement';
import { Document } from '../../document';

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
    BudgetStatementAction,
};

/**
 * A string literal type representing the format for attaching audit reports to a budget statement.
 */
export type AuditAttachment = `attachment://audits/${string}`;

/**
 * Represents the state of a budget statement.
 */
export type State = BudgetStatementData;

/**
 * Represents a budget statement document, which extends the base Document type.
 */
export type BudgetStatementDocument = Document<State, BudgetStatementAction>;
