import { DateTimeLocalInput } from '@/connect';
import {
    AssetFormInputs,
    FixedIncome,
    FormHookProps,
    RWATableSelect,
    RWATableTextInput,
    convertToDateLocalFormat,
    formatDateForDisplay,
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
        maturity: null,
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
              maturity: item.maturity
                  ? convertToDateLocalFormat(item.maturity)
                  : null,
              ISIN: item.ISIN,
              CUSIP: item.CUSIP,
              coupon: item.coupon,
          }
        : createDefaultValues;

    const { submit, reset, register, control, formState, watch } = useSubmit({
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

    const maturityInputValue =
        operation === 'view'
            ? item?.maturity
            : watch('maturity') || item?.maturity;

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
                        inputClassName="text-left"
                        placeholder="E.g. My Asset"
                    />
                ),
            },
            {
                label: 'CUSIP',
                Input: () =>
                    operation === 'view' ? (
                        (item?.CUSIP ?? 'Not available')
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
                            aria-invalid={errors.CUSIP ? 'true' : 'false'}
                            errorMessage={errors.CUSIP?.message}
                            placeholder="E.g. A2345B789"
                        />
                    ),
            },
            {
                label: 'ISIN',
                Input: () =>
                    operation === 'view' ? (
                        (item?.ISIN ?? 'Not available')
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
                            aria-invalid={errors.ISIN ? 'true' : 'false'}
                            errorMessage={errors.ISIN?.message}
                            placeholder="E.g. 123456789ABC"
                        />
                    ),
            },
            {
                label: 'Maturity',
                Input: () => (
                    <DateTimeLocalInput
                        {...register('maturity', {
                            disabled: operation === 'view',
                            setValueAs: value => {
                                if (value === '') return null;
                                return value as string;
                            },
                        })}
                        inputType="date"
                        name="maturity"
                    />
                ),
                inputLabel: maturityInputValue
                    ? formatDateForDisplay(maturityInputValue, true)
                    : null,
            },
            {
                label: 'Asset Type',
                Input: () => (
                    <RWATableSelect
                        addItemButtonProps={{
                            onClick: () =>
                                setShowCreateFixedIncomeTypeModal(true),
                            label: 'Create Fixed Income Type',
                        }}
                        aria-invalid={
                            errors.fixedIncomeTypeId ? 'true' : 'false'
                        }
                        control={control}
                        disabled={operation === 'view'}
                        errorMessage={errors.fixedIncomeTypeId?.message}
                        name="fixedIncomeTypeId"
                        options={fixedIncomeTypes.map(t => ({
                            ...t,
                            value: t.id,
                            label: t.name,
                        }))}
                        rules={{ required: 'Asset type is required' }}
                    />
                ),
            },
            {
                label: 'SPV',
                Input: () => (
                    <RWATableSelect
                        addItemButtonProps={{
                            onClick: () => setShowCreateSpvModal(true),
                            label: 'Create SPV',
                        }}
                        aria-invalid={errors.spvId ? 'true' : 'false'}
                        control={control}
                        disabled={operation === 'view'}
                        errorMessage={errors.spvId?.message}
                        name="spvId"
                        options={spvs.map(t => ({
                            ...t,
                            value: t.id,
                            label: t.name,
                        }))}
                        rules={{ required: 'SPV is required' }}
                    />
                ),
            },
            ...derivedInputsToDisplay,
        ],
        [
            maturityInputValue,
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
