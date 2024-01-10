import type {
    Account,
    AddLineItemInput,
} from '../../../document-models/budget-statement';
import { useState } from 'react';

const categories = [
    {
        ref: 'makerdao/budget-category',
        id: 'CompensationAndBenefits',
        title: 'Compensation & Benefits',
        headcountExpense: true,
    },
    {
        ref: 'makerdao/budget-category',
        id: 'TravelAndEntertainment',
        title: 'Travel & Entertainment',
        headcountExpense: true,
    },
    {
        ref: 'makerdao/budget-category',
        id: 'SoftwareDevelopmentExpense',
        title: 'Software Development Expense',
        headcountExpense: false,
    },
    {
        ref: 'makerdao/budget-category',
        id: 'GasExpense',
        title: 'Gas Expense',
        headcountExpense: true,
    },
];

const groups = [
    {
        ref: 'makerdao/project',
        id: 'Powerhouse',
        title: 'Powerhouse',
        color: 'purple',
    },
    {
        ref: 'makerdao/project',
        id: 'LegalResearch',
        title: 'Legal Research',
        color: 'red',
    },
    {
        ref: 'makerdao/project',
        id: 'MakerAcademy',
        title: 'Maker Academy',
        color: 'teal',
    },
];

const LineItemForm: React.FC<{
    accounts: Account[];
    addLineItem: (input: AddLineItemInput) => void;
}> = ({ accounts, addLineItem }) => {
    const [selectedAccount, setSelectedAccount] = useState<string>(
        accounts.length ? accounts[0].address : '',
    );

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const formJson = Object.fromEntries(formData.entries());
        addLineItem({
            accountId: formData.get('account')!.toString(),
            budgetCap: parseFloat(formJson.budgetCap.toString()),
            actual: parseFloat(formJson.actual.toString()),
            payment: parseFloat(formJson.payment.toString()),
            category: categories.find(
                c => c.id === formJson.category.toString(),
            )!,
            group: groups.find(g => g.id === formJson.group.toString())!,
        });
    }

    return (
        <form
            key={
                accounts.find(a => a.address === selectedAccount)?.lineItems
                    .length
            }
            method="post"
            onSubmit={handleSubmit}
            style={{ maxWidth: 300 }}
        >
            <label>
                Select account:{' '}
                <select
                    name="account"
                    value={selectedAccount ?? ''}
                    onChange={e =>
                        setSelectedAccount(
                            (e.target as HTMLSelectElement).value,
                        )
                    }
                >
                    {accounts.map(account => (
                        <option key={account.address} value={account.address}>
                            {account.name}
                        </option>
                    ))}
                </select>
            </label>
            <pre />
            <label>
                Category:{' '}
                <select name="category">
                    {categories.map(category => (
                        <option value={category.id} key={category.id}>
                            {category.title}
                        </option>
                    ))}
                </select>
            </label>
            <pre />
            <label>
                Group:{' '}
                <select name="group">
                    {groups.map(group => (
                        <option value={group.id} key={group.id}>
                            {group.title}
                        </option>
                    ))}
                </select>
            </label>
            <pre />
            <label>
                Budget Cap:{' '}
                <input name="budgetCap" type="number" placeholder="0" />
            </label>
            <pre />
            <label>
                Payment: <input name="payment" type="number" placeholder="0" />
            </label>
            <pre />
            <label>
                Actual: <input name="actual" type="number" placeholder="0" />
            </label>
            <pre />
            <button type="submit">Submit</button>
        </form>
    );
};

export default LineItemForm;
