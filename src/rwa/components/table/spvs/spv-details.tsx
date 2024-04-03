import {
    ItemDetails,
    RWAFormRow,
    RWATableTextInput,
    SPVDetailsProps,
    SPVFormInputs,
} from '@/rwa';
import { SubmitHandler, useForm } from 'react-hook-form';

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

    const formInputs = () => (
        <div>
            <RWAFormRow
                label="SPV Label"
                hideLine={operation !== 'view'}
                value={
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
