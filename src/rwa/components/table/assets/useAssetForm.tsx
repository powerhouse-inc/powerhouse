import { DateTimeLocalInput } from '@/connect';
import { FixedIncome } from '@/rwa/types';
import { useCallback, useMemo, useState } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import { RWATableSelect, RWATableTextInput } from '../../inputs';
import { AssetFormInputs, RealWorldAssetsState } from '../types';
import { handleTableDatum } from '../utils';

type Props = {
    item?: FixedIncome | undefined;
    defaultValues: AssetFormInputs;
    state: RealWorldAssetsState;
    onSubmitForm: (data: AssetFormInputs) => void;
    operation: 'create' | 'view' | 'edit';
};

export function useAssetForm(props: Props) {
    const [showCreateFixedIncomeTypeModal, setShowCreateFixedIncomeTypeModal] =
        useState(false);
    const [showCreateSpvModal, setShowCreateSpvModal] = useState(false);
    const { item, state, defaultValues, onSubmitForm, operation } = props;

    const { fixedIncomeTypes, spvs } = state;

    const useFormReturn = useForm<AssetFormInputs>({
        mode: 'onBlur',
        defaultValues,
    });

    const {
        handleSubmit,
        register,
        reset,
        control,
        formState: { errors },
    } = useFormReturn;

    const onSubmit: SubmitHandler<AssetFormInputs> = useCallback(
        data => {
            onSubmitForm(data);
        },
        [onSubmitForm],
    );

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
                              <>{handleTableDatum(item?.purchasePrice)}</>
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
                    />
                ),
            },
            ...derivedInputsToDisplay,
        ],
        [
            control,
            derivedInputsToDisplay,
            errors.CUSIP,
            errors.ISIN,
            errors.name,
            fixedIncomeTypes,
            item?.CUSIP,
            item?.ISIN,
            operation,
            register,
            spvs,
        ],
    );

    const submit = handleSubmit(onSubmit);

    return useMemo(() => {
        return {
            submit,
            reset,
            register,
            control,
            inputs,
            formState: { errors },
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
        errors,
        showCreateFixedIncomeTypeModal,
        showCreateSpvModal,
    ]);
}
