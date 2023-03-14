import fs from 'fs';
import { parse } from 'jsonc-parser';
import path from 'path';
import { createBudgetStatement, reducer } from '../../src/budget-statement';

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
    let budgetStatement = createBudgetStatement({ data: initialStep.state });

    // tests each scenario step in sequence
    it.each(steps.slice(1))('should verify $file', ({ json }) => {
        expect.assertions(1);
        try {
            budgetStatement = reducer(budgetStatement, json.operation);
            expect(budgetStatement.data).toStrictEqual(json.state);
        } catch (error) {
            // eslint-disable-next-line jest/no-conditional-expect
            expect(json.error?.message).toBe((error as Error).message);
        }
    });
});
