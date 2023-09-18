import {
    Account,
    AddAccountInput,
} from '../../../document-models/budget-statement';

const AccountForm: React.FC<{
    accounts: Account[];
    addAccount: (account: AddAccountInput) => void;
}> = ({ accounts, addAccount }) => {
    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const formJson = Object.fromEntries(formData.entries());
        addAccount(formJson as unknown as AddAccountInput);
    }

    return (
        <form
            key={accounts.length}
            method="post"
            onSubmit={handleSubmit}
            style={{ maxWidth: 300 }}
        >
            <label>
                Address: <input name="address" placeholder="eth:0x..." />
            </label>
            <pre />
            <label>
                Name: <input name="name" placeholder="" />
            </label>
            <pre />
            <button type="submit">Submit</button>
        </form>
    );
};

export default AccountForm;
