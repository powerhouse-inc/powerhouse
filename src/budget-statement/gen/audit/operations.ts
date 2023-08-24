import {
    AddAuditReportAction,
    DeleteAuditReportAction,
} from './actions';
import { BudgetStatementState } from '../types';

export interface BudgetStatementAuditOperations {
    addAuditReportOperation: (state: BudgetStatementState, action: AddAuditReportAction) => void,
    deleteAuditReportOperation: (state: BudgetStatementState, action: DeleteAuditReportAction) => void,
}