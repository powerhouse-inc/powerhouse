import fs from 'fs';
import { BudgetStatement } from '../../document-models/budget-statement';
import { createAccount, utils } from '../../document-models/budget-statement';

describe('Budget Statement Class', () => {
    afterAll(() => {
        fs.rmSync('./test/budget-statement/temp/march.phbs.zip');
        fs.rmSync('./test/budget-statement/temp/undo.phbs.zip');
    });

    it('should set initial state', async () => {
        const budgetStatement = new BudgetStatement();

        expect(budgetStatement.state.month).toBe(null);
        expect(budgetStatement.state.quoteCurrency).toBe(null);
        expect(budgetStatement.state.owner).toStrictEqual({
            id: null,
            ref: null,
            title: null,
        });
        expect(budgetStatement.state.ftes).toStrictEqual(null);
        expect(budgetStatement.state.accounts).toStrictEqual([]);
        expect(budgetStatement.state.comments).toStrictEqual([]);
        expect(budgetStatement.state.vesting).toStrictEqual([]);
    });

    it('should set base attributes', () => {
        const budgetStatement = new BudgetStatement();

        budgetStatement
            .setMonth({ month: '03/2023' })
            .setQuoteCurrency({ quoteCurrency: 'DAI' })
            .setOwner({ id: '001', ref: 'test', title: 'Test' })
            .setFtes({
                value: 10.8,
                forecast: [
                    {
                        month: '2023/01',
                        value: 10.8,
                    },
                    {
                        month: '2023/03',
                        value: 10.8,
                    },
                    {
                        month: '2023/04',
                        value: 11,
                    },
                    {
                        month: '2023/02',
                        value: 10.8,
                    },
                ],
            });

        expect(budgetStatement.state.month).toBe('03/2023');
        expect(budgetStatement.state.quoteCurrency).toBe('DAI');
        expect(budgetStatement.state.owner).toStrictEqual({
            id: '001',
            ref: 'test',
            title: 'Test',
        });
        expect(budgetStatement.state.ftes).toStrictEqual({
            value: 10.8,
            forecast: [
                {
                    month: '2023/01',
                    value: 10.8,
                },
                {
                    month: '2023/02',
                    value: 10.8,
                },
                {
                    month: '2023/03',
                    value: 10.8,
                },
                {
                    month: '2023/04',
                    value: 11,
                },
            ],
        });
    });

    it('should add account', async () => {
        const budgetStatement = new BudgetStatement();
        budgetStatement.addAccount({
            address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
            name: 'Grants Program',
        });

        expect(budgetStatement.state.accounts).toStrictEqual([
            createAccount({
                address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                name: 'Grants Program',
            }),
        ]);
        expect(budgetStatement.state.accounts).toStrictEqual([
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
            .addAccount({
                address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                name: 'Grants Program',
            })
            .addAccount({
                address: 'eth:0x7c09ff9b59baaebfd721cbda3676826aa6d7bae8',
                name: 'Incubation Program',
            });

        expect(budgetStatement.state.accounts).toStrictEqual([
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
        const budgetStatement = new BudgetStatement();
        budgetStatement.setName('march');
        budgetStatement.setMonth({ month: '03/2023' });
        budgetStatement.addAccount({
            address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
            name: 'Grants Program',
        });
        const path = await budgetStatement.saveToFile(
            './test/budget-statement/temp',
        );

        // Support backslashes for Windows environments
        expect(path.replace(/\\/g, '/')).toBe(
            'test/budget-statement/temp/march.phbs.zip',
        );
    });

    it('should load from file', async () => {
        const budgetStatement = await BudgetStatement.fromFile(
            './test/budget-statement/temp/march.phbs.zip',
        );
        expect(budgetStatement.name).toBe('march');
        expect(budgetStatement.state.month).toBe('03/2023');
        expect(budgetStatement.state.accounts).toStrictEqual([
            {
                address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                name: 'Grants Program',
                lineItems: [],
            },
        ]);
    });

    it('should load from stream', async () => {
        const file = fs.readFileSync(
            './test/budget-statement/temp/march.phbs.zip',
        );
        const budgetStatement = await utils.loadFromInput(file.buffer);
        expect(budgetStatement.name).toBe('march');
        expect(budgetStatement.state.month).toBe('03/2023');
    });

    it('should load from file and keep undo/redo state', async () => {
        const budgetStatement = new BudgetStatement();
        budgetStatement
            .setName('undo')
            .setMonth({ month: '03/2023' })
            .addAccount({
                address: 'eth:000',
                name: 'Grants Program',
            })
            .addAccount({
                address: 'eth:111',
                name: 'Incubation',
            })
            .undo(1);

        expect(budgetStatement.state.accounts).toStrictEqual([
            {
                address: 'eth:000',
                name: 'Grants Program',
                lineItems: [],
            },
        ]);

        const path = await budgetStatement.saveToFile(
            './test/budget-statement/temp',
        );
        const loadedBudgetStatement = await BudgetStatement.fromFile(path);

        expect(loadedBudgetStatement.state.accounts).toStrictEqual([
            {
                address: 'eth:000',
                name: 'Grants Program',
                lineItems: [],
            },
        ]);

        loadedBudgetStatement.redo(1);
        expect(loadedBudgetStatement.state.accounts).toStrictEqual([
            {
                address: 'eth:000',
                name: 'Grants Program',
                lineItems: [],
            },
            {
                address: 'eth:111',
                name: 'Incubation',
                lineItems: [],
            },
        ]);
    });
});
