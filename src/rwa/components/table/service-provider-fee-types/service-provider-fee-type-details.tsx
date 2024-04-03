import {
    Account,
    ItemDetails,
    RWAFormRow,
    RWATableSelect,
    RWATableTextInput,
    ServiceProviderFeeTypeDetailsProps,
    ServiceProviderFeeTypeFormInputs,
} from '@/rwa';
import { SubmitHandler, useForm } from 'react-hook-form';

export function ServiceProviderFeeTypeDetails(
    props: ServiceProviderFeeTypeDetailsProps,
) {
    const { accounts, onCancel, onSubmitForm, item, operation } = props;

    const account = accounts.find(({ id }) => id === item?.accountId);

    const {
        register,
        handleSubmit,
        control,
        reset,
        formState: { errors },
    } = useForm<ServiceProviderFeeTypeFormInputs>({
        defaultValues: {
            name: item?.name ?? null,
            feeType: item?.feeType ?? null,
            accountId:
                account?.id ?? accounts.length > 0 ? accounts[0].id : null,
        },
    });

    const onSubmit: SubmitHandler<ServiceProviderFeeTypeFormInputs> = data => {
        onSubmitForm(data);
    };

    function makeAccountLabel(account: Account) {
        return `${account.label} (${account.id})`;
    }

    function makeAccountOptions(accounts: Account[]) {
        return accounts.map(account => ({
            ...account,
            label: makeAccountLabel(account),
        }));
    }

    const formInputs = () => (
        <div>
            <RWAFormRow
                label="Service Provider ID"
                hideLine={operation !== 'view'}
                value={item?.id}
            />
            <RWAFormRow
                label="Service Provider Name"
                hideLine={operation !== 'view'}
                value={
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
                }
            />
            <RWAFormRow
                label="Fee Type"
                hideLine={operation !== 'view'}
                value={
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
                }
            />
            <RWAFormRow
                label="Account"
                hideLine={operation !== 'view'}
                value={
                    <RWATableSelect
                        control={control}
                        name="accountId"
                        disabled={operation === 'view'}
                        options={makeAccountOptions(accounts)}
                    />
                }
            />
        </div>
    );

    const formProps = {
        formInputs,
        handleSubmit,
        onSubmit,
        reset,
        onCancel,
    };

    return <ItemDetails {...props} {...formProps} />;
}
