import {
    FixedIncomeTypeDetailsProps,
    FixedIncomeTypeFormInputs,
    ItemDetails,
    RWAFormRow,
    RWATableTextInput,
} from '@/rwa';
import { SubmitHandler, useForm } from 'react-hook-form';

export function FixedIncomeTypeDetails(props: FixedIncomeTypeDetailsProps) {
    const { onCancel, onSubmitForm, item, operation } = props;

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<FixedIncomeTypeFormInputs>({
        defaultValues: {
            name: item?.name,
        },
    });

    const onSubmit: SubmitHandler<FixedIncomeTypeFormInputs> = data => {
        onSubmitForm(data);
    };

    const formInputs = () => (
        <div>
            <RWAFormRow
                label="Fixed Income Type ID"
                hideLine={operation !== 'view'}
                value={item?.id}
            />
            <RWAFormRow
                label="Fixed Income Type Name"
                hideLine={operation !== 'view'}
                value={
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
