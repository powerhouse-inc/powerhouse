import { Document, DocumentFile } from '../../document';
import { BudgetStatementAccountAction } from '../gen/account/types';
import { BudgetStatementAuditReportAction } from '../gen/audit/types';
import { BudgetStatementInitAction } from '../gen/init/types';
import { BudgetStatementLineItemAction } from '../gen/line-item/types';
import { BudgetStatementStatusAction } from '../gen/status/types';
import { BudgetStatementTopupAction } from '../gen/topup/types';

/**
 * Represents an expense item for a specific account.
 */
export type LineItem = {
    /** The reference to the category of the expense. */
    category: {
        ref: string;
        id: string;
        title: string;
        headcountExpense: boolean;
    };
    /** The reference to the group of the expense. */
    group: {
        ref: string;
        id: string;
        title: string;
    };
    /** The budget cap for the expense. */
    budgetCap: number | null;
    /** The actual value of the expense. */
    actual: number | null;
    /** The payment done to the wallet in that month. */
    payment: number | null;
    /** The forecast for the next 3 months for that expense. */
    forecast: {
        month: string;
        value: number;
    }[];
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
 * Represents an account with the following information: wallet address, name, current account balance in a given timestamp, target balance, topup transfer information, and expenses.
 */
/**
 * Represents an account for which expenses are managed in a budget statement.
 */
export type Account = {
    /** The wallet address associated with the account. */
    address: string;
    /** The name of the account. */
    name: string;
    /** The balance of the account. */
    accountBalance: {
        /** The timestamp for which the balance is recorded. */
        timestamp: string | null;
        /** The balance value. */
        value: number | null;
    };
    /** The target balance of the account. */
    targetBalance: {
        /** Any comment associated with the target balance. */
        comment: string | null;
        /** The target balance value. */
        value: number | null;
    };
    /** The topup transaction associated with the account. */
    topupTransaction: {
        /** The ID of the topup transaction. */
        id: string | null;
        /** The requested value for the topup transaction. */
        requestedValue: number | null;
        /** The actual value transferred in the topup transaction. */
        value: number | null;
    };
    /** The line items associated with the account. */
    lineItems: LineItem[];
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
 * Represents the status of an audit report: 'Approved', 'ApprovedWithComments', 'NeedsAction', or 'Escalated'.
 */
export type AuditReportStatus =
    | 'Approved'
    | 'ApprovedWithComments'
    | 'NeedsAction'
    | 'Escalated';

/**
 * A string literal type representing the format for attaching audit reports to a budget statement.
 */
export type AuditAttachment = `attachment://audits/${string}`;

/**
 * Represents an audit report for a budget statement.
 */
export type AuditReport = {
    /** The timestamp of the audit report. */
    timestamp: string;
    /** The attachment for the audit report. */
    report: AuditAttachment;
    /** The status of the audit report. */
    status: AuditReportStatus;
};

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

/**
 * Represents the state of a budget statement.
 */
export type State = {
    /**
     * A reference to the owner of the budget statement.
     */
    owner: {
        ref: string | null;
        id: string | null;
        title: string | null;
    };
    /**
     * The month that the budget statement refers to.
     */
    month: string | null;
    /**
     * The status of the budget statement.
     */
    status: BudgetStatus;
    /**
     * The quote currency for the budget statement.
     */
    quoteCurrency: string | null;
    /**
     * The list of accounts in the budget statement.
     */
    accounts: Account[];
    /**
     * The list of audit reports for the budget statement.
     */
    auditReports: AuditReport[];
};

/**
 * Represents the possible actions that can be performed on a budget statement.
 */
export type BudgetStatementAction =
    | BudgetStatementAccountAction
    | BudgetStatementInitAction
    | BudgetStatementLineItemAction
    | BudgetStatementStatusAction
    | BudgetStatementTopupAction
    | BudgetStatementAuditReportAction;

/**
 * Represents a budget statement document, which extends the base Document type.
 */
export type BudgetStatementDocument = Document<State, BudgetStatementAction>;
