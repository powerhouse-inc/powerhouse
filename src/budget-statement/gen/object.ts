import { BudgetStatementState } from './types';
import { ExtendedState } from '../../document';
import { applyMixins, BaseDocument } from '../../document/object';
import { BudgetStatementAction } from './actions';
import { reducer } from './reducer';
import utils from './utils';
import BudgetStatement_Account from './account/object';
import BudgetStatement_LineItem from './line-item/object';
import BudgetStatement_Base from './base/object';
import BudgetStatement_Audit from './audit/object';
import BudgetStatement_Comment from './comment/object';
import BudgetStatement_Vesting from './vesting/object';

export * from './account/object';
export * from './line-item/object';
export * from './base/object';
export * from './audit/object';
export * from './comment/object';
export * from './vesting/object';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface BudgetStatement extends 
    BudgetStatement_Account,
    BudgetStatement_LineItem,
    BudgetStatement_Base,
    BudgetStatement_Audit,
    BudgetStatement_Comment,
    BudgetStatement_Vesting {}

class BudgetStatement extends BaseDocument<BudgetStatementState, BudgetStatementAction> {
    static fileExtension = 'phbs';

    constructor(initialState?: Partial<ExtendedState<Partial<BudgetStatementState>>>) {
        super(reducer, utils.createDocument(initialState));
    }

    public saveToFile(path: string, name?: string) {
        return super.saveToFile(path, BudgetStatement.fileExtension, name);
    }

    public loadFromFile(path: string) {
        return super.loadFromFile(path);
    }

    static async fromFile(path: string) {
        const document = new this();
        await document.loadFromFile(path);
        return document;
    }
}

applyMixins(BudgetStatement, [
    BudgetStatement_Account,
    BudgetStatement_LineItem,
    BudgetStatement_Base,
    BudgetStatement_Audit,
    BudgetStatement_Comment,
    BudgetStatement_Vesting
]);

export { BudgetStatement };