import { DateTimeLocalInput } from '@/connect';
import {
    AssetFormInputs,
    FixedIncome,
    FormHookProps,
    RWATableSelect,
    RWATableTextInput,
    convertToDateTimeLocalFormat,
    handleTableDatum,
} from '@/rwa';
import { useMemo, useState } from 'react';
import { useSubmit } from '../hooks/useSubmit';

export function useAssetForm(
    props: FormHookProps<FixedIncome, AssetFormInputs>,
) {
    const [showCreateFixedIncomeTypeModal, setShowCreateFixedIncomeTypeModal] =
        useState(false);
    const [showCreateSpvModal, setShowCreateSpvModal] = useState(false);
    const {
        item,
        state,
        onSubmitCreate,
        onSubmitEdit,
        onSubmitDelete,
        operation,
    } = props;

    const { fixedIncomeTypes, spvs } = state;

    const createDefaultValues = {
        fixedIncomeTypeId: fixedIncomeTypes[0]?.id ?? null,
        spvId: spvs[0]?.id ?? null,
        name: null,
        maturity: convertToDateTimeLocalFormat(new Date()),
        ISIN: null,
        CUSIP: null,
        coupon: null,
    };

    const editDefaultValues = item
        ? {
              id: item.id,
              fixedIncomeTypeId: item.fixedIncomeTypeId,
              spvId: item.spvId,
              name: item.name,
              maturity: convertToDateTimeLocalFormat(item.maturity),
              ISIN: item.ISIN,
              CUSIP: item.CUSIP,
              coupon: item.coupon,
          }
        : createDefaultValues;

    const { submit, reset, register, control, formState } = useSubmit({
        operation,
        createDefaultValues,
        editDefaultValues,
        onSubmitCreate,
        onSubmitEdit,
        onSubmitDelete,
    });

    const { errors } = formState;

    const derivedInputsToDisplay = useMemo(
        () =>
            operation !== 'create'
                ? [
                      {
                          label: 'Notional',
                          Input: () => <>{handleTableDatum(item?.notional)}</>,
                      },
                      {
                          label: 'Purchase Date',
                          Input: () => (
                              <>{handleTableDatum(item?.purchaseDate)}</>
                          ),
                      },
                      {
                          label: 'Purchase Price',
                          Input: () => (
                              <>{handleTableDatum(item?.purchasePrice, 6)}</>
                          ),
                      },
                      {
                          label: 'Purchase Proceeds',
                          Input: () => (
                              <>{handleTableDatum(item?.purchaseProceeds)}</>
                          ),
                      },
                  ]
                : [],
        [
            item?.notional,
            item?.purchaseDate,
            item?.purchasePrice,
            item?.purchaseProceeds,
            operation,
        ],
    );

    const inputs = useMemo(
        () => [
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
                        inputClassName="text-left"
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
                            value: t.id,
                            label: t.name,
                        }))}
                        addItemButtonProps={{
                            onClick: () =>
                                setShowCreateFixedIncomeTypeModal(true),
                            label: 'Create Fixed Income Type',
                        }}
                        rules={{ required: 'Asset type is required' }}
                        aria-invalid={
                            errors.fixedIncomeTypeId ? 'true' : 'false'
                        }
                        errorMessage={errors.fixedIncomeTypeId?.message}
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
                            value: t.id,
                            label: t.name,
                        }))}
                        addItemButtonProps={{
                            onClick: () => setShowCreateSpvModal(true),
                            label: 'Create SPV',
                        }}
                        rules={{ required: 'SPV is required' }}
                        aria-invalid={errors.spvId ? 'true' : 'false'}
                        errorMessage={errors.spvId?.message}
                    />
                ),
            },
            ...derivedInputsToDisplay,
        ],
        [
            derivedInputsToDisplay,
            register,
            operation,
            errors.name,
            errors.CUSIP,
            errors.ISIN,
            errors.fixedIncomeTypeId,
            errors.spvId,
            item?.CUSIP,
            item?.ISIN,
            control,
            fixedIncomeTypes,
            spvs,
        ],
    );

    return useMemo(() => {
        return {
            submit,
            reset,
            register,
            control,
            inputs,
            formState,
            showCreateFixedIncomeTypeModal,
            setShowCreateFixedIncomeTypeModal,
            showCreateSpvModal,
            setShowCreateSpvModal,
        };
    }, [
        submit,
        reset,
        register,
        control,
        inputs,
        formState,
        showCreateFixedIncomeTypeModal,
        showCreateSpvModal,
    ]);
}
