import {
    Account,
    ItemDetails,
    RWATableSelect,
    RWATableTextInput,
    ServiceProviderFeeTypeDetailsProps,
    ServiceProviderFeeTypeFormInputs,
} from '@/rwa';
import { SubmitHandler, useForm } from 'react-hook-form';
import { FormInputs } from '../../inputs/form-inputs';

export function ServiceProviderFeeTypeDetails(
    props: ServiceProviderFeeTypeDetailsProps,
) {
    const { accounts, transactions, onCancel, onSubmitForm, item, operation } =
        props;

    const account = accounts.find(({ id }) => id === item?.accountId);

    const {
        register,
        handleSubmit,
        control,
        reset,
        formState: { errors },
    } = useForm<ServiceProviderFeeTypeFormInputs>({
        defaultValues: {
            name: item?.name,
            feeType: item?.feeType,
            accountId: account?.id ?? accounts[0]?.id,
        },
    });

    const onSubmit: SubmitHandler<ServiceProviderFeeTypeFormInputs> = data => {
        onSubmitForm(data);
    };

    function makeAccountLabel(account: Account) {
        return `${account.label} (${account.reference})`;
    }

    function makeAccountOptions(accounts: Account[]) {
        return accounts.map(account => ({
            ...account,
            label: makeAccountLabel(account),
        }));
    }

    const inputs = [
        {
            label: 'Service Provider Name',
            Input: () => (
                <RWATableTextInput
                    {...register('name', {
                        disabled: operation === 'view',
                        required: 'Service provider name is required',
                    })}
                    aria-invalid={
                        errors.name?.type === 'required' ? 'true' : 'false'
                    }
                    errorMessage={errors.name?.message}
                    placeholder="E.g. My Service Provider"
                />
            ),
        },
        {
            label: 'Fee Type',
            Input: () => (
                <RWATableTextInput
                    {...register('feeType', {
                        disabled: operation === 'view',
                        required: 'Fee type is required',
                    })}
                    aria-invalid={
                        errors.name?.type === 'required' ? 'true' : 'false'
                    }
                    errorMessage={errors.name?.message}
                    placeholder="E.g. My Fee Type"
                />
            ),
        },
        {
            label: 'Account',
            Input: () => (
                <RWATableSelect
                    control={control}
                    name="accountId"
                    disabled={operation === 'view'}
                    options={makeAccountOptions(accounts)}
                />
            ),
        },
    ];

    const formInputs = () => <FormInputs inputs={inputs} />;

    const dependentTransactions = transactions.filter(t =>
        t.fees?.some(f => f.serviceProviderFeeTypeId === item?.id),
    );

    const dependentItemProps = {
        dependentItemName: 'transactions',
        dependentItemList: dependentTransactions.map((transaction, index) => (
            <div key={transaction.id}>Transaction #{index + 1}</div>
        )),
    };

    const formProps = {
        formInputs,
        dependentItemProps,
        handleSubmit,
        onSubmit,
        reset,
        onCancel,
    };

    return <ItemDetails {...props} {...formProps} />;
}
