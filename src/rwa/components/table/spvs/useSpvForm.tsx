import { useMemo } from 'react';
import { FieldValues, SubmitHandler, useForm } from 'react-hook-form';
import { RWATableTextInput } from '../../inputs';
import { RealWorldAssetsState, SPVFormInputs } from '../types';

type Props = {
    defaultValues: SPVFormInputs;
    state: RealWorldAssetsState;
    operation: 'create' | 'view' | 'edit';
    onSubmitForm: (data: FieldValues) => void;
};

export function useSpvForm(props: Props) {
    const { defaultValues, onSubmitForm, operation } = props;

    const onSubmit: SubmitHandler<SPVFormInputs> = data => {
        onSubmitForm(data);
    };

    const {
        register,
        handleSubmit,
        reset,
        control,
        formState: { errors },
    } = useForm<SPVFormInputs>({
        defaultValues,
    });

    const submit = handleSubmit(onSubmit);

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
            onSubmitForm,
            control,
            inputs,
            formState: { errors },
        };
    }, [submit, reset, register, onSubmitForm, control, inputs, errors]);
}
