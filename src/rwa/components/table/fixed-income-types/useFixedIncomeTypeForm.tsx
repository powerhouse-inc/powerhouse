import { useMemo } from 'react';
import { FieldValues, SubmitHandler, useForm } from 'react-hook-form';
import { RWATableTextInput } from '../../inputs';
import { FixedIncomeTypeFormInputs, RealWorldAssetsState } from '../types';

type Props = {
    defaultValues: FixedIncomeTypeFormInputs;
    state: RealWorldAssetsState;
    operation: 'create' | 'view' | 'edit';
    onSubmitForm: (data: FieldValues) => void;
};

export function useFixedIncomeTypeForm(props: Props) {
    const { defaultValues, onSubmitForm, operation } = props;

    const onSubmit: SubmitHandler<FixedIncomeTypeFormInputs> = data => {
        onSubmitForm(data);
    };

    const {
        register,
        handleSubmit,
        reset,
        control,
        formState: { errors },
    } = useForm<FixedIncomeTypeFormInputs>({
        defaultValues,
    });

    const submit = handleSubmit(onSubmit);

    const inputs = useMemo(
        () => [
            {
                label: 'Fixed Income Type Name',
                Input: () => (
                    <RWATableTextInput
                        {...register('name', {
                            disabled: operation === 'view',
                            required: 'Fixed Income Type name is required',
                        })}
                        aria-invalid={
                            errors.name?.type === 'required' ? 'true' : 'false'
                        }
                        errorMessage={errors.name?.message}
                        placeholder="E.g. My Fixed Income Type name"
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
            onSubmitForm,
            control,
            inputs,
            formState: { errors },
        };
    }, [submit, reset, register, onSubmitForm, control, inputs, errors]);
}
