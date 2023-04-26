import type {
    Account,
    AuditReport,
    AuditReportStatus,
    BudgetStatementData,
    Comment,
    LineItem,
    Vesting,
} from 'document-model-graphql/budget-statement';
import { Document, DocumentFile } from '../../document';
import { BudgetStatementAccountAction } from '../gen/account/types';
import { BudgetStatementAuditReportAction } from '../gen/audit/types';
import { BudgetStatementCommentAction } from '../gen/comment/types';
import { BudgetStatementInitAction } from '../gen/init/types';
import { BudgetStatementLineItemAction } from '../gen/line-item/types';
import { BudgetStatementStatusAction } from '../gen/status/types';
import { BudgetStatementVestingAction } from '../gen/vesting/types';

export type {
    Account,
    LineItem,
    AuditReportStatus,
    AuditReport,
    Comment,
    Vesting,
};

/**
 * Represents the input for creating or updating a line item.
 *
 * @remarks
 * The only necessary attributes are the category and the group
 * as they are used to identify the line item.
 */
export type LineItemInput = Partial<Omit<LineItem, 'category' | 'group'>> & {
    /** The reference to the category of the expense. */
    category: string;
    /** The reference to the group of the expense. */
    group: string;
};

/**
 * Represents the input for creating or updating an account.
 * @remarks
 * The only necessary attribute is the account address,
 * as it is an unique attribute used to identify the account.
 */
export type AccountInput = Partial<Account> & Pick<Account, 'address'>;

/**
 * Represents the status of the budget statement: 'Draft', 'Review', 'Final', or 'Escalated'.
 */
export type BudgetStatus = 'Draft' | 'Review' | 'Final' | 'Escalated';

/**
 * A string literal type representing the format for attaching audit reports to a budget statement.
 */
export type AuditAttachment = `attachment://audits/${string}`;

/**
 * Represents the input for an audit report to be added to a budget statement.
 */
export type AuditReportInput = {
    /**
     * The timestamp for the audit report.
     */
    timestamp: string;
    /**
     * The data for the audit report.
     */
    report: DocumentFile;
    /**
     * The status of the audit report.
     */
    status: AuditReportStatus;
};

export type VestingInput = Partial<Omit<Vesting, 'key'>> & {
    key: Vesting['key'];
};

export type CommentInput = Partial<Omit<Comment, 'key'>> & {
    key: Comment['key'];
};

/**
 * Represents the state of a budget statement.
 */
export type State = BudgetStatementData;

/**
 * Represents the possible actions that can be performed on a budget statement.
 */
export type BudgetStatementAction =
    | BudgetStatementAccountAction
    | BudgetStatementInitAction
    | BudgetStatementLineItemAction
    | BudgetStatementStatusAction
    | BudgetStatementAuditReportAction
    | BudgetStatementVestingAction
    | BudgetStatementCommentAction;

/**
 * Represents a budget statement document, which extends the base Document type.
 */
export type BudgetStatementDocument = Document<State, BudgetStatementAction>;
