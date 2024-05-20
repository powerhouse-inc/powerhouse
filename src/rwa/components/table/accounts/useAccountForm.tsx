import { useMemo } from 'react';
import { FieldValues, SubmitHandler, useForm } from 'react-hook-form';
import { RWATableTextInput } from '../../inputs';
import { AccountFormInputs, RealWorldAssetsState } from '../types';

type Props = {
    defaultValues: AccountFormInputs;
    state: RealWorldAssetsState;
    operation: 'create' | 'view' | 'edit';
    onSubmitForm: (data: FieldValues) => void;
};

export function useAccountForm(props: Props) {
    const { defaultValues, onSubmitForm, operation } = props;

    const onSubmit: SubmitHandler<AccountFormInputs> = data => {
        onSubmitForm(data);
    };

    const {
        register,
        handleSubmit,
        reset,
        control,
        formState: { errors },
    } = useForm<AccountFormInputs>({
        defaultValues,
    });

    const submit = handleSubmit(onSubmit);

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
            onSubmitForm,
            control,
            inputs,
            formState: { errors },
        };
    }, [submit, reset, register, onSubmitForm, control, inputs, errors]);
}
