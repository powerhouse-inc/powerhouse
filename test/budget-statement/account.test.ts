import {
    addAccount,
    createBudgetStatement,
    deleteAccount,
    reducer,
    updateAccount,
} from '../../src/budget-statement';

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
        expect(state.data.accounts).toStrictEqual([]);
    });

    it('should update account', async () => {
        let state = createBudgetStatement();
        state = reducer(
            createBudgetStatement(),
            addAccount([
                {
                    address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                    name: 'Grants Program',
                },
            ])
        );
        const newState = reducer(
            state,
            updateAccount([
                {
                    address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                    name: 'Incubation',
                },
            ])
        );
        expect(newState.data.accounts[0].name).toBe('Incubation');
        expect(state.data.accounts[0].name).toBe('Grants Program');
    });

    it('should delete account', async () => {
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
            deleteAccount(['eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f'])
        );
        expect(newState.data.accounts.length).toBe(0);
        expect(state.data.accounts.length).toBe(1);
    });
});
