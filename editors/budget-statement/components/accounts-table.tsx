import type {
    BudgetStatementState,
    DeleteLineItemInput,
} from '../../../document-models/budget-statement';
import { useMemo } from 'react';

const Currency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
});

const AccountsTable: React.FC<{
    data: BudgetStatementState;
    onDeleteAccount?: (account: string) => void;
    onDeleteLineItem?: (input: DeleteLineItemInput) => void;
}> = ({ data, onDeleteAccount, onDeleteLineItem }) => {
    const accounts = data.accounts;
    const accountStats = useMemo(
        () =>
            accounts.map(({ address, name, lineItems }) => {
                const { actuals, payments } = lineItems.reduce(
                    (acc, curr) => ({
                        actuals: acc.actuals + (curr.actual || 0),
                        payments: acc.payments + (curr.payment || 0),
                    }),
                    { actuals: 0, payments: 0 },
                );

                return { address, name, actuals, payments };
            }),
        [accounts],
    );

    return (
        <div>
            <h2>Accounts:</h2>
            <table style={{ borderSpacing: 12 }}>
                <thead>
                    <tr>
                        <th align="left">Name</th>
                        <th align="left">Address</th>
                        <th align="left">Actuals</th>
                        <th align="left">Payments</th>
                    </tr>
                </thead>
                <tbody>
                    {accountStats.map(account => (
                        <tr key={account.address}>
                            <td>{account.name}</td>
                            <td>{account.address.slice(0, 10)}...</td>
                            <td>{Currency.format(account.actuals)}</td>
                            <td>{Currency.format(account.payments)}</td>
                            {onDeleteAccount && (
                                <td>
                                    <button
                                        onClick={() =>
                                            onDeleteAccount(account.address)
                                        }
                                    >
                                        Delete
                                    </button>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default AccountsTable;
