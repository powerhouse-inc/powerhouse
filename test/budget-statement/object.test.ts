import fs from 'fs';
import { BudgetStatement } from '../../src/budget-statement';

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
                accountBalance: {
                    timestamp: null,
                    value: null,
                },
                targetBalance: {
                    comment: null,
                    value: null,
                },
                topupTransaction: {
                    id: null,
                    requestedValue: null,
                    value: null,
                },
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
                accountBalance: {
                    timestamp: null,
                    value: null,
                },
                targetBalance: {
                    comment: null,
                    value: null,
                },
                topupTransaction: {
                    id: null,
                    requestedValue: null,
                    value: null,
                },
                lineItems: [],
            },
            {
                address: 'eth:0x7c09ff9b59baaebfd721cbda3676826aa6d7bae8',
                name: 'Incubation Program',
                accountBalance: {
                    timestamp: null,
                    value: null,
                },
                targetBalance: {
                    comment: null,
                    value: null,
                },
                topupTransaction: {
                    id: null,
                    requestedValue: null,
                    value: null,
                },
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
                accountBalance: {
                    timestamp: null,
                    value: null,
                },
                targetBalance: {
                    comment: null,
                    value: null,
                },
                topupTransaction: {
                    id: null,
                    requestedValue: null,
                    value: null,
                },
                lineItems: [],
            },
        ]);
    });
});
