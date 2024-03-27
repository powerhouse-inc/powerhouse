import { DateTimeLocalInput } from '@/connect';
import {
    AssetDetailsProps,
    AssetFormInputs,
    ItemDetails,
    RWAFormRow,
    RWANumberInput,
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
        defaultValues: {
            fixedIncomeTypeId: fixedIncomeType?.id ?? fixedIncomeTypes[0].id,
            spvId: spv?.id ?? spvs[0].id,
            name: item?.name,
            maturity: convertToDateTimeLocalFormat(
                item?.maturity ?? new Date(),
            ),
            ISIN: item?.ISIN,
            CUSIP: item?.CUSIP,
            coupon: item?.coupon,
        },
    });

    const onSubmit: SubmitHandler<AssetFormInputs> = data => {
        onSubmitForm(data);
    };

    const formInputs = () => (
        <div>
            <RWAFormRow
                label="Asset ID"
                hideLine={operation !== 'view'}
                value={item?.id}
            />
            <RWAFormRow
                label="Asset Name"
                hideLine={operation !== 'view'}
                value={
                    <RWATableTextInput
                        {...register('name', {
                            disabled: operation === 'view',
                            required: 'Asset name is required',
                        })}
                        aria-invalid={
                            errors.name?.type === 'required' ? 'true' : 'false'
                        }
                        errorMessage={errors.name?.message}
                        placeholder="E.g. My Asset"
                    />
                }
            />
            <RWAFormRow
                label="CUSIP"
                hideLine={operation !== 'view'}
                value={
                    <RWANumberInput
                        name="CUSIP"
                        control={control}
                        disabled={operation === 'view'}
                        placeholder="E.g. 123456789"
                        maxLength={9}
                        numericFormatProps={{
                            allowNegative: false,
                            decimalScale: 0,
                            thousandSeparator: '',
                        }}
                    />
                }
            />
            <RWAFormRow
                label="ISIN"
                hideLine={operation !== 'view'}
                value={
                    <RWANumberInput
                        name="ISIN"
                        control={control}
                        disabled={operation === 'view'}
                        placeholder="E.g. 123456789012"
                        maxLength={12}
                        numericFormatProps={{
                            allowNegative: false,
                            decimalScale: 0,
                            thousandSeparator: '',
                        }}
                    />
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
