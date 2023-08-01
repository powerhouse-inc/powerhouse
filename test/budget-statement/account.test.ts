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
        const document = createBudgetStatement();
        const newDocument = reducer(
            document,
            addAccount([
                {
                    address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                    name: 'Grants Program',
                },
            ])
        );
        expect(newDocument.state.accounts).toStrictEqual([
            {
                address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                name: 'Grants Program',
                lineItems: [],
            },
        ]);
        expect(document.state.accounts).toStrictEqual([]);
    });

    it('should update account', async () => {
        let document = createBudgetStatement();
        document = reducer(
            createBudgetStatement(),
            addAccount([
                {
                    address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                    name: 'Grants Program',
                },
            ])
        );
        const newDocument = reducer(
            document,
            updateAccount([
                {
                    address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                    name: 'Incubation',
                },
            ])
        );
        expect(newDocument.state.accounts[0].name).toBe('Incubation');
        expect(document.state.accounts[0].name).toBe('Grants Program');
    });

    it('should delete account', async () => {
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
            deleteAccount(['eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f'])
        );
        expect(newDocument.state.accounts.length).toBe(0);
        expect(document.state.accounts.length).toBe(1);
    });

    it('should throw exception if adding account with same address', () => {
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
        expect(() =>
            reducer(
                document,
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
        const document = createBudgetStatement({
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

        const newDocument = reducer(
            document,
            sortAccounts(['eth:0x02', 'eth:0x00'])
        );

        expect(newDocument.state.accounts.map(a => a.address)).toStrictEqual([
            'eth:0x02',
            'eth:0x00',
            'eth:0x01',
        ]);
    });
});
