import {
    AccountDetailsProps,
    AccountFormInputs,
    ItemDetails,
    RWATableTextInput,
} from '@/rwa';
import { SubmitHandler, useForm } from 'react-hook-form';
import { FormInputs } from '../../inputs/form-inputs';

export function AccountDetails(props: AccountDetailsProps) {
    const { onSubmitForm, item, operation, isPrincipalLenderAccount } = props;

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<AccountFormInputs>({
        defaultValues: {
            label: item?.label,
            reference: item?.reference,
        },
    });

    const onSubmit: SubmitHandler<AccountFormInputs> = data => {
        onSubmitForm(data);
    };

    const inputs = [
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
                        errors.reference?.type === 'required' ? 'true' : 'false'
                    }
                    errorMessage={errors.reference?.message}
                    placeholder="E.g. bank account number or ETH address"
                />
            ),
        },
    ];

    const formInputs = () => <FormInputs inputs={inputs} />;

    const isAllowedToDeleteItem = !isPrincipalLenderAccount;

    const formProps = {
        formInputs,
        handleSubmit,
        onSubmit,
        reset,
        isAllowedToDeleteItem,
    };

    return <ItemDetails {...props} {...formProps} />;
}
