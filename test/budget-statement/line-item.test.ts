import { reducer } from '../../src/budget-statement';
import { createBudgetStatement } from '../../src/budget-statement/custom/utils';
import {
    addAccount,
    addLineItem,
    deleteLineItem,
    updateLineItem,
} from '../../src/budget-statement/gen';

describe('Budget Statement line item reducer', () => {
    it('should add line item', async () => {
        let state = createBudgetStatement();
        state = reducer(
            state,
            addAccount([
                {
                    address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                    name: 'Grants Program',
                },
            ])
        );
        const newState = reducer(
            state,
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
                    },
                    headcountExpense: true,
                },
            ])
        );
        expect(newState.data.accounts[0].lineItems).toStrictEqual([
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
                },
                budgetCap: null,
                payment: null,
                actual: null,
                comment: null,
                headcountExpense: true,
                forecast: [],
            },
        ]);
        expect(state.data.accounts[0].lineItems).toStrictEqual([]);
    });

    it('should update line item', async () => {
        let state = createBudgetStatement();
        state = reducer(
            state,
            addAccount([
                {
                    address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                    name: 'Grants Program',
                },
            ])
        );
        state = reducer(
            state,
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
                    },
                    headcountExpense: true,
                },
            ])
        );
        const newState = reducer(
            state,
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

        expect(newState.data.accounts[0].lineItems[0]).toStrictEqual({
            category: {
                ref: 'makerdao/budget-category',
                id: 'TravelAndEntertainment',
                title: 'Travel & Entertainment',
            },
            group: {
                ref: 'makerdao/project',
                id: 'core-unit/SES/2023/005',
                title: 'Core Unit Operational Support',
            },
            headcountExpense: true,
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
        expect(state.data.accounts[0].lineItems[0]).toStrictEqual({
            category: {
                ref: 'makerdao/budget-category',
                id: 'TravelAndEntertainment',
                title: 'Travel & Entertainment',
            },
            group: {
                ref: 'makerdao/project',
                id: 'core-unit/SES/2023/005',
                title: 'Core Unit Operational Support',
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
        let state = createBudgetStatement();
        state = reducer(
            state,
            addAccount([
                {
                    address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                    name: 'Grants Program',
                },
            ])
        );
        state = reducer(
            state,
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
                    },
                    headcountExpense: true,
                },
            ])
        );
        const newState = reducer(
            state,
            deleteLineItem('eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f', [
                {
                    category: 'TravelAndEntertainment',
                    group: 'core-unit/SES/2023/005',
                },
            ])
        );
        expect(newState.data.accounts[0].lineItems.length).toBe(0);
        expect(state.data.accounts[0].lineItems.length).toBe(1);
    });
});
