import {
    Account,
    AccountFormInputs,
    FormHookProps,
    RWATableTextInput,
} from '@/rwa';
import { useMemo } from 'react';
import { useSubmit } from '../hooks/useSubmit';

export function useAccountForm(
    props: FormHookProps<Account, AccountFormInputs>,
) {
    const { item, onSubmitCreate, onSubmitEdit, onSubmitDelete, operation } =
        props;

    const createDefaultValues = {
        label: null,
        reference: null,
    };

    const editDefaultValues = item
        ? {
              label: item.label,
              reference: item.reference,
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

    const inputs = useMemo(
        () => [
            {
                label: 'Account Label',
                Input: () => (
                    <RWATableTextInput
                        {...register('label', {
                            disabled: operation === 'view',
                            required: 'Account label is required',
                        })}
                        aria-invalid={
                            errors.label?.type === 'required' ? 'true' : 'false'
                        }
                        errorMessage={errors.label?.message}
                        placeholder="E.g. My Label"
                    />
                ),
            },
            {
                label: 'Account Reference',
                Input: () => (
                    <RWATableTextInput
                        {...register('reference', {
                            disabled: operation === 'view',
                            required: 'Account reference is required',
                        })}
                        aria-invalid={
                            errors.reference?.type === 'required'
                                ? 'true'
                                : 'false'
                        }
                        errorMessage={errors.reference?.message}
                        placeholder="E.g. bank account number or ETH address"
                    />
                ),
            },
        ],
        [
            errors.label?.message,
            errors.label?.type,
            errors.reference?.message,
            errors.reference?.type,
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
        };
    }, [submit, reset, register, control, inputs, errors]);
}
