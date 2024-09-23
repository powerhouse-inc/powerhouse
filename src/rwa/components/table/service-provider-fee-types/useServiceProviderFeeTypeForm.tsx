import {
    Account,
    FormHookProps,
    RWATableSelect,
    RWATableTextInput,
    ServiceProviderFeeType,
    ServiceProviderFeeTypeFormInputs,
} from '@/rwa';
import { useCallback, useMemo, useState } from 'react';
import { useSubmit } from '../hooks/useSubmit';

export function useServiceProviderFeeTypeForm(
    props: FormHookProps<
        ServiceProviderFeeType,
        ServiceProviderFeeTypeFormInputs
    >,
) {
    const [showCreateAccountModal, setShowCreateAccountModal] = useState(false);

    const {
        item,
        state,
        onSubmitCreate,
        onSubmitEdit,
        onSubmitDelete,
        operation,
    } = props;

    const { accounts } = state;

    const createDefaultValues = {
        name: null,
        feeType: null,
        accountId: accounts[0]?.id ?? null,
    };

    const editDefaultValues = item
        ? {
              id: item.id,
              name: item.name,
              feeType: item.feeType,
              accountId: item.accountId,
          }
        : createDefaultValues;

    const { submit, reset, register, control, formState } = useSubmit({
        operation,
        createDefaultValues,
        editDefaultValues,
        onSubmitCreate,
        onSubmitEdit,
        onSubmitDelete,
    });

    const { errors } = formState;

    function makeAccountLabel(account: Account) {
        return `${account.label} (${account.reference})`;
    }

    const makeAccountOptions = useCallback((accounts: Account[]) => {
        return accounts.map(account => ({
            ...account,
            value: account.id,
            label: makeAccountLabel(account),
        }));
    }, []);

    const inputs = useMemo(
        () => [
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
                        addItemButtonProps={{
                            onClick: () => setShowCreateAccountModal(true),
                            label: 'Create Account',
                        }}
                        aria-invalid={errors.accountId ? 'true' : 'false'}
                        control={control}
                        disabled={operation === 'view'}
                        errorMessage={errors.accountId?.message}
                        name="accountId"
                        options={makeAccountOptions(accounts)}
                        rules={{ required: 'Account is required' }}
                    />
                ),
            },
        ],
        [
            accounts,
            control,
            errors.accountId,
            errors.name?.message,
            errors.name?.type,
            makeAccountOptions,
            operation,
            register,
        ],
    );

    return useMemo(() => {
        return {
            submit,
            reset,
            register,
            control,
            inputs,
            formState: { errors },
            showCreateAccountModal,
            setShowCreateAccountModal,
        };
    }, [
        submit,
        reset,
        register,
        control,
        inputs,
        errors,
        showCreateAccountModal,
    ]);
}
