import { reducer } from '../../src/budget-statement';
import {
    createAccount,
    createBudgetStatement,
    createLineItem,
} from '../../src/budget-statement/custom/utils';
import {
    addAccount,
    addLineItem,
    deleteLineItem,
    sortLineItems,
    updateLineItem,
} from '../../src/budget-statement/gen';

describe('Budget Statement line item reducer', () => {
    it('should add line item', async () => {
        let document = createBudgetStatement();
        document = reducer(
            document,
            addAccount([
                {
                    address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                    name: 'Grants Program',
                },
            ])
        );
        const newDocument = reducer(
            document,
            addLineItem('eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f', [
                {
                    category: {
                        ref: 'makerdao/budget-category',
                        id: 'TravelAndEntertainment',
                        title: 'Travel & Entertainment',
                    },
                    group: {
                        ref: 'makerdao/project',
                        id: 'core-unit/SES/2023/005',
                        title: 'Core Unit Operational Support',
                        color: 'teal',
                    },
                    headcountExpense: true,
                },
            ])
        );
        expect(newDocument.state.accounts[0].lineItems).toStrictEqual([
            {
                category: {
                    ref: 'makerdao/budget-category',
                    id: 'TravelAndEntertainment',
                    title: 'Travel & Entertainment',
                },
                group: {
                    ref: 'makerdao/project',
                    id: 'core-unit/SES/2023/005',
                    title: 'Core Unit Operational Support',
                    color: 'teal',
                },
                budgetCap: null,
                payment: null,
                actual: null,
                comment: null,
                headcountExpense: true,
                forecast: [],
            },
        ]);
        expect(document.state.accounts[0].lineItems).toStrictEqual([]);
    });

    it('should update line item', async () => {
        let document = createBudgetStatement();
        document = reducer(
            document,
            addAccount([
                {
                    address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                    name: 'Grants Program',
                },
            ])
        );
        document = reducer(
            document,
            addLineItem('eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f', [
                {
                    category: {
                        ref: 'makerdao/budget-category',
                        id: 'TravelAndEntertainment',
                        title: 'Travel & Entertainment',
                    },
                    group: {
                        ref: 'makerdao/project',
                        id: 'core-unit/SES/2023/005',
                        title: 'Core Unit Operational Support',
                        color: 'teal',
                    },
                    headcountExpense: true,
                },
            ])
        );
        const newDocument = reducer(
            document,
            updateLineItem('eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f', [
                {
                    category: 'TravelAndEntertainment',
                    group: 'core-unit/SES/2023/005',
                    budgetCap: 1000,
                    actual: 100,
                    forecast: [
                        {
                            month: '2023/02',
                            value: 2000,
                            budgetCap: 2000,
                        },
                    ],
                },
            ])
        );

        expect(newDocument.state.accounts[0].lineItems[0]).toStrictEqual({
            category: {
                ref: 'makerdao/budget-category',
                id: 'TravelAndEntertainment',
                title: 'Travel & Entertainment',
            },
            group: {
                ref: 'makerdao/project',
                id: 'core-unit/SES/2023/005',
                title: 'Core Unit Operational Support',
                color: 'teal',
            },
            headcountExpense: false,
            budgetCap: 1000,
            actual: 100,
            payment: null,
            comment: null,
            forecast: [
                {
                    month: '2023/02',
                    value: 2000,
                    budgetCap: 2000,
                },
            ],
        });
        expect(document.state.accounts[0].lineItems[0]).toStrictEqual({
            category: {
                ref: 'makerdao/budget-category',
                id: 'TravelAndEntertainment',
                title: 'Travel & Entertainment',
            },
            group: {
                ref: 'makerdao/project',
                id: 'core-unit/SES/2023/005',
                title: 'Core Unit Operational Support',
                color: 'teal',
            },
            headcountExpense: true,
            budgetCap: null,
            actual: null,
            payment: null,
            comment: null,
            forecast: [],
        });
    });

    it('should delete line item', async () => {
        let document = createBudgetStatement();
        document = reducer(
            document,
            addAccount([
                {
                    address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                    name: 'Grants Program',
                },
            ])
        );
        document = reducer(
            document,
            addLineItem('eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f', [
                {
                    category: {
                        ref: 'makerdao/budget-category',
                        id: 'TravelAndEntertainment',
                        title: 'Travel & Entertainment',
                    },
                    group: {
                        ref: 'makerdao/project',
                        id: 'core-unit/SES/2023/005',
                        title: 'Core Unit Operational Support',
                        color: 'teal',
                    },
                    headcountExpense: true,
                },
            ])
        );
        const newDocument = reducer(
            document,
            deleteLineItem('eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f', [
                {
                    category: 'TravelAndEntertainment',
                    group: 'core-unit/SES/2023/005',
                },
            ])
        );
        expect(newDocument.state.accounts[0].lineItems.length).toBe(0);
        expect(document.state.accounts[0].lineItems.length).toBe(1);
    });

    it('should throw if adding duplicated line item', async () => {
        let document = createBudgetStatement({});
        document = reducer(
            document,
            addAccount([
                {
                    address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                    name: 'Grants Program',
                },
            ])
        );
        document = reducer(
            document,
            addLineItem('eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f', [
                {
                    category: {
                        ref: 'makerdao/budget-category',
                        id: 'TravelAndEntertainment',
                        title: 'Travel & Entertainment',
                    },
                    group: {
                        ref: 'makerdao/project',
                        id: 'core-unit/SES/2023/005',
                        title: 'Core Unit Operational Support',
                        color: 'teal',
                    },
                    headcountExpense: true,
                },
            ])
        );
        expect(() =>
            reducer(
                document,
                addLineItem('eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f', [
                    {
                        category: {
                            ref: 'makerdao/budget-category',
                            id: 'TravelAndEntertainment',
                            title: 'Travel & Entertainment',
                        },
                        group: {
                            ref: 'makerdao/project',
                            id: 'core-unit/SES/2023/005',
                            title: 'Core Unit Operational Support',
                            color: 'teal',
                        },
                        headcountExpense: true,
                    },
                ])
            )
        ).toThrow();
    });

    it('should sort line items', () => {
        const document = createBudgetStatement({
            state: {
                accounts: [
                    createAccount({
                        address:
                            'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                        name: 'Grants Program',
                        lineItems: [
                            createLineItem({
                                category: {
                                    ref: '0',
                                    id: '0',
                                    title: '0',
                                },
                                group: {
                                    ref: '0',
                                    id: '0',
                                    title: '0',
                                    color: 'teal',
                                },
                            }),
                            createLineItem({
                                category: {
                                    ref: '1',
                                    id: '1',
                                    title: '1',
                                },
                                group: {
                                    ref: '1',
                                    id: '1',
                                    title: '1',
                                    color: 'teal',
                                },
                            }),
                            createLineItem({
                                category: {
                                    ref: '2',
                                    id: '2',
                                    title: '2',
                                },
                                group: {
                                    ref: '2',
                                    id: '2',
                                    title: '2',
                                    color: 'teal',
                                },
                            }),
                        ],
                    }),
                ],
            },
        });

        const newDocument = reducer(
            document,
            sortLineItems('eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f', [
                { group: '2', category: '2' },
                { group: '0', category: '0' },
            ])
        );

        expect(
            newDocument.state.accounts[0].lineItems.map(l => ({
                group: l.group?.id,
                category: l.category?.id,
            }))
        ).toStrictEqual([
            { group: '2', category: '2' },
            { group: '0', category: '0' },
            { group: '1', category: '1' },
        ]);
    });
});
