/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import fs from 'fs';
import { parse } from 'jsonc-parser';
import path from 'path';
import {
    BudgetStatement,
    reducer,
} from '../..';
import { BudgetStatementAction } from '../../gen';
import utils from '../../gen/utils';

const { createDocument } = utils;

// loads scenario from jsonc files
// const testFolder =
//     '../document-model-specs/powerhouse/budget-statement/scenario-1';
// const files = fs.readdirSync(testFolder);
// const steps = files.map(file => {
//     const filePath = path.join(testFolder, file);
//     return {
//         file,
//         json: parse(fs.readFileSync(filePath, { encoding: 'utf-8' })),
//     };
// });

// loads scenario from jsonc files
describe.skip('Budget Statement scenario 1', () => {
    // creates budget statement using initial state
    // const initialStep = steps[0].json;
    // let budgetStatement = createDocument({ state: initialStep.state });
    // // tests each scenario step in sequence
    // it.each(steps.slice(1))('should verify $file', ({ json }) => {
    //     expect.assertions(1);
    //     try {
    //         budgetStatement = reducer(budgetStatement, json.operation);
    //         expect(budgetStatement.state).toStrictEqual(json.state);
    //     } catch (error) {
    //         expect(json.error?.message).toBe((error as Error).message);
    //     }
    // });
});

class BudgetStatementTest extends BudgetStatement {
    public dispatchTest(action: BudgetStatementAction) {
        const method = action.type
            .toLowerCase()
            .split('_')
            .map((word, i) =>
                !i ? word : `${word[0].toUpperCase()}${word.slice(1)}`,
            )
            .join('');

        // @ts-expect-error dynamic access
        return this[method](action.input, action.attachments);
    }
}

describe.skip('Budget Statement scenario 1 with object methods', () => {
    // creates budget statement using initial state
    // const initialStep = steps[0].json;
    // const budgetStatement = new BudgetStatementTest({
    //     state: initialStep.state,
    // });

    // tests each scenario step in sequence
    // it.each(steps.slice(1))('should verify $file', ({ json }) => {
    //     expect.assertions(1);

    //     try {
    //         budgetStatement.dispatchTest(
    //             JSON.parse(JSON.stringify(json.operation)) as BudgetStatementAction,
    //         );
    //         expect(budgetStatement.state).toStrictEqual(json.state);
    //     } catch (error) {
    //         expect(json.error?.message).toBe((error as Error).message);
    //     }
    // });
});
