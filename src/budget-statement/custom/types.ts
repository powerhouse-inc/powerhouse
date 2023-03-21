import { Document } from '../../document';
import {
    BudgetStatementAccountAction,
    BudgetStatementInitAction,
    BudgetStatementLineItemAction,
    BudgetStatementStatusAction,
    BudgetStatementTopupAction,
} from '../gen';
import { BudgetStatementAuditReportAction } from '../gen/audit';

export type LineItem = {
    category: {
        ref: string;
        id: string;
        title: string;
        headcountExpense: boolean;
    };
    group: {
        ref: string;
        id: string;
        title: string;
    };
    budgetCap: number | null;
    payment: number | null;
    actual: number | null;
    forecast: {
        month: string;
        value: number;
    }[];
};

export type LineItemInput = Partial<Omit<LineItem, 'category' | 'group'>> & {
    category: string;
    group: string;
};

export type Account = {
    address: string;
    name: string;
    accountBalance: {
        timestamp: string | null;
        value: number | null;
    };
    targetBalance: {
        comment: string | null;
        value: number | null;
    };
    topupTransaction: {
        id: string | null;
        requestedValue: number | null;
        value: number | null;
    };
    lineItems: LineItem[];
};

export type AccountInput = Partial<Account> & Pick<Account, 'address'>;

export type BudgetStatus = 'Draft' | 'Review' | 'Final' | 'Escalated';

export type AuditReportStatus =
    | 'Approved'
    | 'ApprovedWithComments'
    | 'NeedsAction'
    | 'Escalated';

export type AuditAttachment = `attachment://audits/${string}`;

export type AuditReport = {
    timestamp: string;
    report: AuditAttachment;
    status: AuditReportStatus;
};

export type AuditReportInput = {
    timestamp: string;
    report: {
        data: string;
        mimeType: string;
    };
    status: AuditReportStatus;
};

export type State = {
    owner: {
        ref: string | null;
        id: string | null;
        title: string | null;
    };
    month: string | null;
    status: BudgetStatus;
    quoteCurrency: string | null;
    accounts: Account[];
    auditReports: AuditReport[];
};

export type BudgetStatementAction =
    | BudgetStatementAccountAction
    | BudgetStatementInitAction
    | BudgetStatementLineItemAction
    | BudgetStatementStatusAction
    | BudgetStatementTopupAction
    | BudgetStatementAuditReportAction;

export type BudgetStatement = Document<State, BudgetStatementAction>;
