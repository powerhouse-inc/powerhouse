import {
    addAccount,
    createBudgetStatement,
    reducer,
    requestTopup,
    transferTopup,
} from '../../src/budget-statement';

describe('Budget Statement topup reducer', () => {
    it('should request topup', async () => {
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
            requestTopup('eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f', 1000)
        );

        expect(newState.data.accounts[0].topupTransaction.requestedValue).toBe(
            1000
        );
        expect(state.data.accounts[0].topupTransaction.requestedValue).toBe(
            null
        );
    });

    it('should transfer topup', async () => {
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
            requestTopup('eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f', 1000)
        );

        const newState = reducer(
            state,
            transferTopup(
                'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                1000,
                'eth:0x3F23D0E301C458B095A02b12E3bC4c752a844eD9'
            )
        );

        expect(newState.data.accounts[0].topupTransaction).toStrictEqual({
            value: 1000,
            requestedValue: 1000,
            id: 'eth:0x3F23D0E301C458B095A02b12E3bC4c752a844eD9',
        });
        expect(state.data.accounts[0].topupTransaction).toStrictEqual({
            value: null,
            requestedValue: 1000,
            id: null,
        });
    });
});
