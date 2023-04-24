import fs from 'fs';
import {
    BudgetStatement,
    BudgetStatementAction,
    reducer,
    State,
} from '../../src/budget-statement';
import { loadFromInput } from '../../src/document/utils/file';

describe('Budget Statement Class', () => {
    afterAll(() => {
        fs.rmSync('./test/budget-statement/temp/march.phbs.zip');
    });

    it('should set initial state', async () => {
        const budgetStatement = new BudgetStatement({
            data: { month: '03/2023' },
        });

        expect(budgetStatement.month).toBe('03/2023');
        expect(budgetStatement.quoteCurrency).toBe(null);
    });

    it('should add account', async () => {
        const budgetStatement = new BudgetStatement();
        budgetStatement.addAccount([
            {
                address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                name: 'Grants Program',
            },
        ]);

        expect(budgetStatement.accounts).toStrictEqual([
            budgetStatement.getAccount(
                'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f'
            ),
        ]);
        expect(budgetStatement.accounts).toStrictEqual([
            {
                address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                name: 'Grants Program',
                lineItems: [],
            },
        ]);
    });

    it('should chain add account calls', async () => {
        const budgetStatement = new BudgetStatement();
        budgetStatement
            .addAccount([
                {
                    address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                    name: 'Grants Program',
                },
            ])
            .addAccount([
                {
                    address: 'eth:0x7c09ff9b59baaebfd721cbda3676826aa6d7bae8',
                    name: 'Incubation Program',
                },
            ]);

        expect(budgetStatement.accounts).toStrictEqual([
            {
                address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                name: 'Grants Program',
                lineItems: [],
            },
            {
                address: 'eth:0x7c09ff9b59baaebfd721cbda3676826aa6d7bae8',
                name: 'Incubation Program',
                lineItems: [],
            },
        ]);
    });

    it('should save to file', async () => {
        const budgetStatement = new BudgetStatement({
            name: 'march',
            data: { month: '03/2023' },
        });
        budgetStatement.addAccount([
            {
                address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                name: 'Grants Program',
            },
        ]);
        const path = await budgetStatement.saveToFile(
            './test/budget-statement/temp'
        );
        expect(path).toBe('test/budget-statement/temp/march.phbs.zip');
    });

    it('should load from file', async () => {
        const budgetStatement = await BudgetStatement.fromFile(
            './test/budget-statement/temp/march.phbs.zip'
        );
        expect(budgetStatement.name).toBe('march');
        expect(budgetStatement.month).toBe('03/2023');
        expect(budgetStatement.accounts).toStrictEqual([
            {
                address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                name: 'Grants Program',
                lineItems: [],
            },
        ]);
    });

    it('should load from stream', async () => {
        const file = fs.readFileSync(
            './test/budget-statement/temp/march.phbs.zip'
        );
        const budgetStatement = await loadFromInput<
            State,
            BudgetStatementAction
        >(file.buffer, reducer);
        expect(budgetStatement.name).toBe('march');
        expect(budgetStatement.data.month).toBe('03/2023');
    });
});
