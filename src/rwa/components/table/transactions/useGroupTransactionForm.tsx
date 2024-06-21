import { DateTimeLocalInput } from '@/connect';
import {
    FormHookProps,
    FormattedNumber,
    GroupTransactionFormInputs,
    GroupTransactionsTableItem,
    RWANumberInput,
    RWATableSelect,
    RWATableTextInput,
    allGroupTransactionTypes,
    assetGroupTransactions,
    calculateUnitPrice,
    convertToDateTimeLocalFormat,
    feesTransactions,
    getFixedIncomeAssets,
    groupTransactionTypeLabels,
    makeFixedIncomeOptionLabel,
} from '@/rwa';

import { useMemo, useState } from 'react';
import { Control, useFieldArray, useWatch } from 'react-hook-form';
import { twMerge } from 'tailwind-merge';
import { useSubmit } from '../hooks/useSubmit';

function UnitPrice(props: {
    control: Control<GroupTransactionFormInputs>;
    isViewOnly: boolean;
}) {
    const { control } = props;

    const cashAmount = useWatch({ control, name: 'cashAmount' });
    const fixedIncomeAmount = useWatch({ control, name: 'fixedIncomeAmount' });

    const unitPrice = calculateUnitPrice(cashAmount, fixedIncomeAmount);

    return (
        <div className={twMerge('mt-1 w-fit', !props.isViewOnly && 'ml-auto')}>
            <span className="text-gray-600">Unit Price</span>{' '}
            <span className="text-gray-900">
                <FormattedNumber value={unitPrice} decimalScale={6} />
            </span>
        </div>
    );
}

export function useGroupTransactionForm(
    props: FormHookProps<
        GroupTransactionsTableItem,
        GroupTransactionFormInputs
    >,
) {
    const [showCreateAssetModal, setShowCreateAssetModal] = useState(false);
    const [
        showCreateServiceProviderFeeTypeModal,
        setShowCreateServiceProviderFeeTypeModal,
    ] = useState(false);
    const {
        item,
        state,
        onSubmitCreate,
        onSubmitEdit,
        onSubmitDelete,
        operation,
    } = props;

    const { serviceProviderFeeTypes, accounts } = state;

    const fixedIncomes = useMemo(() => getFixedIncomeAssets(state), [state]);

    const transactionTypeOptions = allGroupTransactionTypes.map(type => ({
        label: groupTransactionTypeLabels[type],
        value: type,
    }));
    const fixedIncomeOptions = fixedIncomes.map(fixedIncome => ({
        label: makeFixedIncomeOptionLabel(fixedIncome),
        value: fixedIncome.id,
    }));

    const createDefaultValues = {
        type: allGroupTransactionTypes[0],
        entryTime: convertToDateTimeLocalFormat(new Date()),
        cashAmount: null,
        fixedIncomeId: fixedIncomes[0]?.id ?? null,
        fixedIncomeAmount: null,
        serviceProviderFeeTypeId: null,
        fees: null,
        txRef: null,
    };

    const editDefaultValues = item
        ? {
              id: item.id,
              type: item.type,
              entryTime: convertToDateTimeLocalFormat(item.entryTime),
              cashAmount: item.cashTransaction?.amount ?? null,
              fixedIncomeId: item.fixedIncomeTransaction?.assetId ?? null,
              fixedIncomeAmount: item.fixedIncomeTransaction?.amount ?? null,
              serviceProviderFeeTypeId: item.serviceProviderFeeTypeId ?? null,
              fees: item.fees ?? null,
              txRef: item.txRef ?? null,
          }
        : createDefaultValues;

    const { submit, reset, register, watch, control, formState } = useSubmit({
        operation,
        createDefaultValues,
        editDefaultValues,
        onSubmitCreate,
        onSubmitEdit,
        onSubmitDelete,
        customSubmitHandler,
    });

    const type = useWatch({ control, name: 'type' });

    const isAssetTransaction = !!type && assetGroupTransactions.includes(type);
    const isFeesTransaction = !!type && feesTransactions.includes(type);
    const canHaveTransactionFees = !isFeesTransaction;

    function customSubmitHandler(data: GroupTransactionFormInputs) {
        if (!operation || operation === 'view') return;
        const id = data.id;
        const type = data.type;
        const entryTime = data.entryTime;
        const cashAmount = data.cashAmount;
        const fixedIncomeId = isAssetTransaction ? data.fixedIncomeId : null;
        const serviceProviderFeeTypeId = data.serviceProviderFeeTypeId ?? null;
        const fixedIncomeAmount = isAssetTransaction
            ? data.fixedIncomeAmount
            : null;
        const txRef = data.txRef ?? null;
        const fees = canHaveTransactionFees ? data.fees : null;
        const formActions = {
            create: onSubmitCreate,
            edit: onSubmitEdit,
            delete: onSubmitDelete,
        };
        const onSubmitForm = formActions[operation];

        onSubmitForm?.({
            id,
            type,
            entryTime,
            cashAmount,
            fixedIncomeId,
            fixedIncomeAmount,
            serviceProviderFeeTypeId,
            fees,
            txRef,
        });
    }

    const { errors } = formState;

    const { fields, append, remove } = useFieldArray({
        control,
        name: 'fees',
    });

    const serviceProviderFeeTypeOptions = useMemo(
        () =>
            serviceProviderFeeTypes.map(spft => ({
                label: `${spft.name} — ${spft.feeType} — ${accounts.find(account => account.id === spft.accountId)?.reference}`,
                value: spft.id,
            })),
        [serviceProviderFeeTypes, accounts],
    );

    const inputs = [
        {
            label: 'Transaction Type',
            Input: () => (
                <RWATableSelect
                    control={control}
                    name="type"
                    disabled={operation === 'view'}
                    options={transactionTypeOptions}
                    rules={{ required: 'Transaction type is required' }}
                    aria-invalid={errors.type ? 'true' : 'false'}
                    errorMessage={errors.type?.message}
                />
            ),
        },
        {
            label: 'Entry Time',
            Input: () => (
                <DateTimeLocalInput
                    {...register('entryTime', {
                        required: true,
                        disabled: operation === 'view',
                    })}
                    name="entryTime"
                />
            ),
        },
        isFeesTransaction
            ? {
                  label: 'Service Provider',
                  Input: () => (
                      <RWATableSelect
                          control={control}
                          name="serviceProviderFeeTypeId"
                          disabled={operation === 'view'}
                          options={serviceProviderFeeTypeOptions}
                          addItemButtonProps={{
                              onClick: () =>
                                  setShowCreateServiceProviderFeeTypeModal(
                                      true,
                                  ),
                              label: 'Add Service Provider',
                          }}
                      />
                  ),
              }
            : null,
        isAssetTransaction
            ? {
                  label: 'Asset name',
                  Input: () => (
                      <RWATableSelect
                          control={control}
                          name="fixedIncomeId"
                          disabled={operation === 'view'}
                          options={fixedIncomeOptions}
                          addItemButtonProps={{
                              onClick: () => setShowCreateAssetModal(true),
                              label: 'Create Asset',
                          }}
                          rules={{ required: 'Asset name is required' }}
                          aria-invalid={errors.type ? 'true' : 'false'}
                          errorMessage={errors.type?.message}
                      />
                  ),
              }
            : undefined,
        isAssetTransaction
            ? {
                  label: 'Quantity',
                  Input: () => (
                      <RWANumberInput
                          name="fixedIncomeAmount"
                          rules={{
                              required: 'Quantity is required',
                              validate: {
                                  positive: value =>
                                      (!!value && Number(value) > 0) ||
                                      'Asset proceeds must be greater than zero',
                              },
                          }}
                          disabled={operation === 'view'}
                          control={control}
                          aria-invalid={
                              errors.fixedIncomeAmount ? 'true' : 'false'
                          }
                          errorMessage={errors.fixedIncomeAmount?.message}
                          placeholder="E.g. 1,000.00"
                      />
                  ),
              }
            : undefined,
        {
            label: isAssetTransaction ? 'Asset Proceeds' : 'Cash Amount',
            Input: () => (
                <>
                    <RWANumberInput
                        name="cashAmount"
                        rules={{
                            required: 'Asset proceeds is required',
                            validate: {
                                positive: value =>
                                    (!!value && Number(value) > 0) ||
                                    'Asset proceeds must be greater than zero',
                            },
                        }}
                        currency="USD"
                        disabled={operation === 'view'}
                        control={control}
                        aria-invalid={errors.cashAmount ? 'true' : 'false'}
                        errorMessage={errors.cashAmount?.message}
                        placeholder="E.g. $1,000.00"
                    />
                    {isAssetTransaction && (
                        <UnitPrice
                            control={control}
                            isViewOnly={operation === 'view'}
                        />
                    )}
                </>
            ),
        },
        {
            label: 'Transaction reference',
            Input: () => (
                <RWATableTextInput
                    {...register('txRef', {
                        disabled: operation === 'view',
                    })}
                    aria-invalid={errors.txRef ? 'true' : 'false'}
                    errorMessage={errors.txRef?.message}
                    placeholder="E.g. 0x123..."
                />
            ),
        },
    ].filter(Boolean);

    return useMemo(() => {
        return {
            submit,
            reset,
            register,
            append,
            watch,
            fields,
            remove,
            control,
            inputs,
            formState,
            serviceProviderFeeTypeOptions,
            showCreateAssetModal,
            setShowCreateAssetModal,
            showCreateServiceProviderFeeTypeModal,
            setShowCreateServiceProviderFeeTypeModal,
            canHaveTransactionFees,
        };
    }, [
        submit,
        reset,
        register,
        append,
        watch,
        fields,
        remove,
        control,
        inputs,
        formState,
        serviceProviderFeeTypeOptions,
        showCreateAssetModal,
        showCreateServiceProviderFeeTypeModal,
        canHaveTransactionFees,
    ]);
}
