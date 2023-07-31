import fs from 'fs';
import { parse } from 'jsonc-parser';
import path from 'path';
import {
    BudgetStatement,
    BudgetStatementAction,
    reducer,
} from '../../src/budget-statement';
import { createBudgetStatement } from '../../src/budget-statement/custom/utils';

// loads scenario from jsonc files
const testFolder =
    '../document-model-specs/powerhouse/budget-statement/scenario-1';
const files = fs.readdirSync(testFolder);
const steps = files.map(file => {
    const filePath = path.join(testFolder, file);
    return {
        file,
        json: parse(fs.readFileSync(filePath, { encoding: 'utf-8' })),
    };
});

// loads scenario from jsonc files
describe('Budget Statement scenario 1', () => {
    // creates budget statement using initial state
    const initialStep = steps[0].json;
    let budgetStatement = createBudgetStatement({ state: initialStep.state });
    // tests each scenario step in sequence
    it.each(steps.slice(1))('should verify $file', ({ json }) => {
        expect.assertions(1);
        try {
            budgetStatement = reducer(budgetStatement, json.operation);
            expect(budgetStatement.extendedState.state).toStrictEqual(
                json.state
            );
        } catch (error) {
            // eslint-disable-next-line jest/no-conditional-expect
            expect(json.error?.message).toBe((error as Error).message);
        }
    });
});

class BudgetStatementTest extends BudgetStatement {
    public dispatchTest(action: BudgetStatementAction) {
        const method = action.type
            .toLowerCase()
            .split('_')
            .map((word, i) =>
                !i ? word : `${word[0].toUpperCase()}${word.slice(1)}`
            )
            .join('');

        return typeof action.input === 'object'
            ? // @ts-ignore
              this[method]?.(...Object.values(action.input), action.attachments)
            : // @ts-ignore
              this[method](action.input, action.attachments);
    }
}

describe('Budget Statement scenario 1 with object methods', () => {
    // creates budget statement using initial state
    const initialStep = steps[0].json;
    const budgetStatement = new BudgetStatementTest({
        state: initialStep.state,
    });

    // tests each scenario step in sequence
    it.each(steps.slice(1))('should verify $file', ({ json }) => {
        expect.assertions(1);

        try {
            budgetStatement.dispatchTest(
                JSON.parse(JSON.stringify(json.operation))
            );
            expect(budgetStatement.state).toStrictEqual(json.state);
        } catch (error) {
            // eslint-disable-next-line jest/no-conditional-expect
            expect(json.error?.message).toBe((error as Error).message);
        }
    });
});
