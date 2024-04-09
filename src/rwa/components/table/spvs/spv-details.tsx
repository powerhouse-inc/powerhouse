import {
    ItemDetails,
    RWATableTextInput,
    SPVDetailsProps,
    SPVFormInputs,
} from '@/rwa';
import { SubmitHandler, useForm } from 'react-hook-form';
import { FormInputs } from '../../inputs/form-inputs';

export function SPVDetails(props: SPVDetailsProps) {
    const { onCancel, onSubmitForm, item, operation } = props;

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<SPVFormInputs>({
        defaultValues: {
            name: item?.name ?? null,
        },
    });

    const onSubmit: SubmitHandler<SPVFormInputs> = data => {
        onSubmitForm(data);
    };

    const inputs = [
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
    ];

    const formInputs = () => <FormInputs inputs={inputs} />;

    const formProps = {
        formInputs,
        handleSubmit,
        onSubmit,
        reset,
        onCancel,
    };

    return <ItemDetails {...props} {...formProps} />;
}
