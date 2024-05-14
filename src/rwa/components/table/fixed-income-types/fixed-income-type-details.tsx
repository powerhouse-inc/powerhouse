import {
    FixedIncomeTypeDetailsProps,
    FixedIncomeTypeFormInputs,
    ItemDetails,
    RWATableTextInput,
} from '@/rwa';
import { SubmitHandler, useForm } from 'react-hook-form';
import { FormInputs } from '../../inputs/form-inputs';

export function FixedIncomeTypeDetails(props: FixedIncomeTypeDetailsProps) {
    const { onCancel, onSubmitForm, item, operation, assets } = props;

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

    const inputs = [
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
    ];

    const formInputs = () => <FormInputs inputs={inputs} />;

    const dependentAssets = assets.filter(
        asset => asset.fixedIncomeTypeId === item?.id,
    );

    const dependentItemsList = dependentAssets.map(asset => (
        <div key={asset.id}>{asset.name}</div>
    ));

    const dependentItemProps = {
        dependentItemName: 'assets',
        dependentItemList: dependentItemsList,
    };

    const formProps = {
        formInputs,
        dependentItemProps,
        handleSubmit,
        onSubmit,
        reset,
        onCancel,
    };

    return <ItemDetails {...props} {...formProps} />;
}
