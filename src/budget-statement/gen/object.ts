import { applyMixins, BaseDocument, ExtendedState } from '../../document';
import {
    BudgetStatementAction,
    BudgetStatementState,
    reducer,
} from '../custom';
import { createBudgetStatement } from '../custom/utils';
import AccountObject from './account/object';
import AuditObject from './audit/object';
import BaseObject from './base/object';
import CommentObject from './comment/object';
import LineItemObject from './line-item/object';
import VestingObject from './vesting/object';

/**
 * Represents a BudgetStatement object that extends the {@link BaseDocument} class to provide a convenient
 * interface for managing a budget statement.
 */
interface BudgetStatement
    extends AccountObject,
        AuditObject,
        CommentObject,
        BaseObject,
        LineItemObject,
        VestingObject {}

/**
 * Represents a budget statement document.
 *
 * @extends BaseDocument<State, BudgetStatementAction>
 * @module
 */
class BudgetStatement extends BaseDocument<
    BudgetStatementState,
    BudgetStatementAction
> {
    /**
     * The file extension used to save budget statements.
     */
    static fileExtension = 'phbs';

    /**
     *
     * Creates a new BudgetStatement instance.
     * @param initialState - An optional object representing the initial state of the BudgetStatement.
     */
    constructor(
        initialState?: Partial<ExtendedState<Partial<BudgetStatementState>>>
    ) {
        const document = createBudgetStatement(initialState);
        super(reducer, document);
    }

    /**
     * Saves the budget statement to a file.
     *
     * @param path The path to the file to save.
     * @returns A promise that resolves when the save operation completes.
     */
    public saveToFile(path: string, name?: string) {
        return super.saveToFile(path, BudgetStatement.fileExtension, name);
    }

    /**
     * Loads the budget statement from a file.
     *
     * @param path The path to the file to load.
     * @returns A promise that resolves with the loaded `BudgetStatement` instance.
     */
    public loadFromFile(path: string) {
        return super.loadFromFile(path);
    }

    /**
     * Creates a new `BudgetStatement` instance from a file.
     *
     * @param path The path to the file to load.
     * @returns A promise that resolves with the loaded `BudgetStatement` instance.
     */
    static async fromFile(path: string) {
        const budgetStatement = new this();
        await budgetStatement.loadFromFile(path);
        return budgetStatement;
    }
}

applyMixins(BudgetStatement, [
    AccountObject,
    AuditObject,
    CommentObject,
    BaseObject,
    LineItemObject,
    VestingObject,
]);

/**
 * Represents a BudgetStatement object that extends the {@link BaseDocument} class to provide a convenient
 * interface for managing a budget statement.
 * @extends AccountObject
 * @extends AuditObject
 * @extends CommentObject
 * @extends InitObject
 * @extends LineItemObject
 * @extends StatusObject
 * @extends VestingObject
 */
export { BudgetStatement };
