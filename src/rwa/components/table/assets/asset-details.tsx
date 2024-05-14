import { DateTimeLocalInput } from '@/connect';
import {
    AssetDetailsProps,
    AssetFormInputs,
    ItemDetails,
    RWATableSelect,
    RWATableTextInput,
    convertToDateTimeLocalFormat,
    handleTableDatum,
} from '@/rwa';
import { SubmitHandler, useForm } from 'react-hook-form';
import { FormInputs } from '../../inputs/form-inputs';

export function AssetDetails(props: AssetDetailsProps) {
    const {
        fixedIncomeTypes,
        spvs,
        onCancel,
        onSubmitForm,
        item,
        operation,
        transactions,
    } = props;

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
            fixedIncomeTypeId: fixedIncomeType?.id ?? fixedIncomeTypes[0]?.id,
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

    const derivedInputsToDisplay =
        operation !== 'create'
            ? [
                  {
                      label: 'Notional',
                      Input: () => <>{handleTableDatum(item?.notional)}</>,
                  },
                  {
                      label: 'Purchase Date',
                      Input: () => <>{handleTableDatum(item?.purchaseDate)}</>,
                  },
                  {
                      label: 'Purchase Price',
                      Input: () => <>{handleTableDatum(item?.purchasePrice)}</>,
                  },
                  {
                      label: 'Purchase Proceeds',
                      Input: () => (
                          <>{handleTableDatum(item?.purchaseProceeds)}</>
                      ),
                  },
              ]
            : [];

    const inputs = [
        {
            label: 'Asset Name',
            Input: () => (
                <RWATableTextInput
                    {...register('name', {
                        disabled: operation === 'view',
                        required: 'Asset name is required',
                    })}
                    aria-invalid={errors.name ? 'true' : 'false'}
                    errorMessage={errors.name?.message}
                    placeholder="E.g. My Asset"
                />
            ),
        },
        {
            label: 'CUSIP',
            Input: () =>
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
                ),
        },
        {
            label: 'ISIN',
            Input: () =>
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
                ),
        },
        {
            label: 'Maturity',
            Input: () => (
                <DateTimeLocalInput
                    {...register('maturity', {
                        required: true,
                        disabled: operation === 'view',
                    })}
                    name="maturity"
                />
            ),
        },
        {
            label: 'Asset Type',
            Input: () => (
                <RWATableSelect
                    control={control}
                    name="fixedIncomeTypeId"
                    disabled={operation === 'view'}
                    options={fixedIncomeTypes.map(t => ({
                        ...t,
                        label: t.name,
                    }))}
                />
            ),
        },
        {
            label: 'SPV',
            Input: () => (
                <RWATableSelect
                    control={control}
                    name="spvId"
                    disabled={operation === 'view'}
                    options={spvs.map(t => ({
                        ...t,
                        label: t.name,
                    }))}
                />
            ),
        },
        ...derivedInputsToDisplay,
    ];

    const formInputs = () => <FormInputs inputs={inputs} />;

    const dependentTransactions = transactions
        .map((t, index) => ({
            ...t,
            txNumber: index + 1,
        }))
        .filter(t => t.fixedIncomeTransaction?.assetId === item?.id);

    const dependentItemList = dependentTransactions.map(t => (
        <div key={t.id}>Transaction #{t.txNumber}</div>
    ));

    const dependentItemProps = {
        dependentItemName: 'transactions',
        dependentItemList,
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
