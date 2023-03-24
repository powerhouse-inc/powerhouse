import { applyMixins, DocumentObject } from '../../document';
import {
    BudgetStatement,
    BudgetStatementAction,
    reducer,
    State,
} from '../custom';
import { createBudgetStatement } from '../custom/utils';
import AccountObject from './account/object';
import AuditObject from './audit/object';
import InitObject from './init/object';
import LineItemObject from './line-item/object';
import StatusObject from './status/object';
import TopupObject from './topup/object';

interface BudgetStatementObject
    extends AccountObject,
        AuditObject,
        InitObject,
        LineItemObject,
        StatusObject,
        TopupObject {}

class BudgetStatementObject extends DocumentObject<
    State,
    BudgetStatementAction
> {
    static fileExtension = 'phbs';

    constructor(
        initialState?: Partial<
            Omit<BudgetStatement, 'data'> & {
                data: Partial<BudgetStatement['data']>;
            }
        >
    ) {
        super(reducer, createBudgetStatement(initialState));
    }

    get month() {
        return this.state.data.month;
    }

    get owner() {
        return this.state.data.owner;
    }

    get quoteCurrency() {
        return this.state.data.quoteCurrency;
    }

    public saveToFile(path: string) {
        return super.saveToFile(path, BudgetStatementObject.fileExtension);
    }

    public loadFromFile(path: string) {
        return super.loadFromFile(path);
    }

    static async fromFile(path: string) {
        const budgetStatement = new this();
        await budgetStatement.loadFromFile(path);
        return budgetStatement;
    }
}

applyMixins(BudgetStatementObject, [
    AccountObject,
    AuditObject,
    InitObject,
    LineItemObject,
    StatusObject,
    TopupObject,
]);

export { BudgetStatementObject };
