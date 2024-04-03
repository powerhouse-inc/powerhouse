import { DateTimeLocalInput } from '@/connect';
import {
    AssetDetailsProps,
    AssetFormInputs,
    ItemDetails,
    RWAFormRow,
    RWATableSelect,
    RWATableTextInput,
    convertToDateTimeLocalFormat,
} from '@/rwa';
import { SubmitHandler, useForm } from 'react-hook-form';

export function AssetDetails(props: AssetDetailsProps) {
    const { fixedIncomeTypes, spvs, onCancel, onSubmitForm, item, operation } =
        props;

    const fixedIncomeType = fixedIncomeTypes.find(
        ({ id }) => id === item?.fixedIncomeTypeId,
    );
    const spv = spvs.find(({ id }) => id === item?.spvId);

    const {
        register,
        handleSubmit,
        control,
        reset,
        formState: { errors },
    } = useForm<AssetFormInputs>({
        mode: 'onBlur',
        defaultValues: {
            fixedIncomeTypeId:
                fixedIncomeType?.id ?? fixedIncomeTypes.length > 0
                    ? fixedIncomeTypes[0].id
                    : null,
            spvId: spv?.id ?? spvs.length > 0 ? spvs[0].id : null,
            name: item?.name ?? null,
            maturity: convertToDateTimeLocalFormat(
                item?.maturity ?? new Date(),
            ),
            ISIN: item?.ISIN ?? null,
            CUSIP: item?.CUSIP ?? null,
            coupon: item?.coupon ?? null,
        },
    });

    const onSubmit: SubmitHandler<AssetFormInputs> = data => {
        onSubmitForm(data);
    };

    const formInputs = () => (
        <div>
            <RWAFormRow
                label="Asset Name"
                hideLine={operation !== 'view'}
                value={
                    <RWATableTextInput
                        {...register('name', {
                            disabled: operation === 'view',
                            required: 'Asset name is required',
                        })}
                        aria-invalid={errors.name ? 'true' : 'false'}
                        errorMessage={errors.name?.message}
                        placeholder="E.g. My Asset"
                    />
                }
            />
            <RWAFormRow
                label="CUSIP"
                hideLine={operation !== 'view'}
                value={
                    operation === 'view' ? (
                        item?.CUSIP ?? 'Not available'
                    ) : (
                        <RWATableTextInput
                            {...register('CUSIP', {
                                maxLength: {
                                    value: 9,
                                    message:
                                        'CUSIP cannot be longer than 9 characters',
                                },
                                minLength: {
                                    value: 9,
                                    message:
                                        'CUSIP cannot be shorter than 9 characters',
                                },
                                pattern: {
                                    value: /^[a-zA-Z0-9]*$/,
                                    message: 'CUSIP must be alphanumeric',
                                },
                            })}
                            errorMessage={errors.CUSIP?.message}
                            aria-invalid={errors.CUSIP ? 'true' : 'false'}
                            placeholder="E.g. A2345B789"
                        />
                    )
                }
            />
            <RWAFormRow
                label="ISIN"
                hideLine={operation !== 'view'}
                value={
                    operation === 'view' ? (
                        item?.ISIN ?? 'Not available'
                    ) : (
                        <RWATableTextInput
                            {...register('ISIN', {
                                maxLength: {
                                    value: 12,
                                    message:
                                        'ISIN cannot be longer than 12 characters',
                                },
                                minLength: {
                                    value: 12,
                                    message:
                                        'ISIN cannot be shorter than 12 characters',
                                },
                                pattern: {
                                    value: /^[a-zA-Z0-9]*$/,
                                    message: 'ISIN must be alphanumeric',
                                },
                            })}
                            errorMessage={errors.ISIN?.message}
                            aria-invalid={errors.ISIN ? 'true' : 'false'}
                            placeholder="E.g. 123456789ABC"
                        />
                    )
                }
            />
            <RWAFormRow
                label="Maturity"
                hideLine={operation !== 'view'}
                value={
                    <DateTimeLocalInput
                        {...register('maturity', {
                            required: true,
                            disabled: operation === 'view',
                        })}
                        name="maturity"
                    />
                }
            />
            <RWAFormRow
                label="Asset Type"
                hideLine={operation !== 'view'}
                value={
                    <RWATableSelect
                        control={control}
                        name="fixedIncomeTypeId"
                        disabled={operation === 'view'}
                        options={fixedIncomeTypes.map(t => ({
                            ...t,
                            label: t.name,
                        }))}
                    />
                }
            />
            <RWAFormRow
                label="SPV"
                hideLine={operation !== 'view'}
                value={
                    <RWATableSelect
                        control={control}
                        name="spvId"
                        disabled={operation === 'view'}
                        options={spvs.map(t => ({
                            ...t,
                            label: t.name,
                        }))}
                    />
                }
            />
            {operation !== 'create' && (
                <>
                    <RWAFormRow
                        label="Notional"
                        hideLine={operation !== 'view'}
                        value={item?.notional}
                    />
                    <RWAFormRow
                        label="Purchase Date"
                        hideLine={operation !== 'view'}
                        value={item?.purchaseDate}
                    />
                    <RWAFormRow
                        label="Purchase Price"
                        hideLine={operation !== 'view'}
                        value={item?.purchasePrice}
                    />
                    <RWAFormRow
                        label="Purchase Proceeds"
                        hideLine={operation !== 'view'}
                        value={item?.purchaseProceeds}
                    />
                </>
            )}
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
