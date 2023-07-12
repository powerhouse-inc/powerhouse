import { reducer } from '../../src/budget-statement';
import {
    createAccount,
    createBudgetStatement,
} from '../../src/budget-statement/custom/utils';
import {
    addAccount,
    deleteAccount,
    sortAccounts,
    updateAccount,
} from '../../src/budget-statement/gen';

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
        expect(newState.state.accounts).toStrictEqual([
            {
                address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                name: 'Grants Program',
                lineItems: [],
            },
        ]);
        expect(state.state.accounts).toStrictEqual([]);
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
        expect(newState.state.accounts[0].name).toBe('Incubation');
        expect(state.state.accounts[0].name).toBe('Grants Program');
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
        expect(newState.state.accounts.length).toBe(0);
        expect(state.state.accounts.length).toBe(1);
    });

    it('should throw exception if adding account with same address', () => {
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
        expect(() =>
            reducer(
                state,
                addAccount([
                    {
                        address:
                            'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                        name: 'Incubation',
                    },
                ])
            )
        ).toThrow();
    });

    it('should sort accounts', () => {
        const state = createBudgetStatement({
            state: {
                accounts: [
                    createAccount({
                        address: 'eth:0x00',
                        name: '0',
                    }),
                    createAccount({
                        address: 'eth:0x01',
                        name: '1',
                    }),
                    createAccount({
                        address: 'eth:0x02',
                        name: '2',
                    }),
                ],
            },
        });

        const newState = reducer(state, sortAccounts(['eth:0x02', 'eth:0x00']));

        expect(newState.state.accounts.map(a => a.address)).toStrictEqual([
            'eth:0x02',
            'eth:0x00',
            'eth:0x01',
        ]);
    });
});
