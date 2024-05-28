import { FormHookProps, RWATableTextInput, SPV, SPVFormInputs } from '@/rwa';
import { useMemo } from 'react';
import { useSubmit } from '../hooks/useSubmit';

export function useSpvForm(props: FormHookProps<SPV, SPVFormInputs>) {
    const { item, onSubmitCreate, onSubmitEdit, onSubmitDelete, operation } =
        props;

    const createDefaultValues = {
        name: null,
    };

    const editDefaultValues = item
        ? {
              name: item.name,
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
                label: 'SPV name',
                Input: () => (
                    <RWATableTextInput
                        {...register('name', {
                            disabled: operation === 'view',
                            required: 'SPV name is required',
                        })}
                        aria-invalid={
                            errors.name?.type === 'required' ? 'true' : 'false'
                        }
                        errorMessage={errors.name?.message}
                        placeholder="E.g. My SPV name"
                    />
                ),
            },
        ],
        [errors.name?.message, errors.name?.type, operation, register],
    );

    return useMemo(() => {
        return {
            submit,
            reset,
            register,
            control,
            inputs,
            formState,
        };
    }, [submit, reset, register, control, inputs, formState]);
}
