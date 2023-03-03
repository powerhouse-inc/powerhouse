import {
    addAccount,
    deleteAccount,
    updateAccount,
} from '../../src/budget-statement';

import { createBudgetStatement, reducer } from '../../src/budget-statement';

describe('Budget Statement account reducer', () => {
    it('should add account', async () => {
        const state = createBudgetStatement();
        const newState = reducer(
            state,
            addAccount([
                {
                    address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                    name: 'Grants Program',
                },
            ])
        );
        expect(newState.data.accounts).toStrictEqual([
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

    it('should update account', async () => {
        const state = createBudgetStatement();
        let newState = reducer(
            state,
            addAccount([
                {
                    address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                    name: 'Grants Program',
                },
            ])
        );
        newState = reducer(
            newState,
            updateAccount([
                {
                    address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                    name: 'Incubation',
                },
            ])
        );
        expect(newState.data.accounts[0].name).toBe('Incubation');
    });

    it('should delete account', async () => {
        const state = createBudgetStatement();
        let newState = reducer(
            state,
            addAccount([
                {
                    address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                    name: 'Grants Program',
                },
            ])
        );
        newState = reducer(
            newState,
            deleteAccount(['eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f'])
        );
        expect(newState.data.accounts.length).toBe(0);
    });
});
