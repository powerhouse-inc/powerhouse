import {
    AccountDetailsProps,
    AccountFormInputs,
    ItemDetails,
    RWAFormRow,
    RWATableTextInput,
} from '@/rwa';
import { SubmitHandler, useForm } from 'react-hook-form';

export function AccountDetails(props: AccountDetailsProps) {
    const { onCancel, onSubmitForm, item, operation } = props;

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<AccountFormInputs>({
        defaultValues: {
            label: item?.label ?? undefined,
            reference: item?.reference,
        },
    });

    const onSubmit: SubmitHandler<AccountFormInputs> = data => {
        onSubmitForm(data);
    };

    const formInputs = () => (
        <div>
            <RWAFormRow
                label="Account ID"
                hideLine={operation !== 'view'}
                value={item?.id}
            />
            <RWAFormRow
                label="Account Label"
                hideLine={operation !== 'view'}
                value={
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
                }
            />
            <RWAFormRow
                label="Account Reference"
                hideLine={operation !== 'view'}
                value={
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
