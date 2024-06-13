import { DateTimeLocalInput } from '@/connect';
import {
    FormHookProps,
    FormattedNumber,
    GroupTransactionFormInputs,
    GroupTransactionsTableItem,
    RWANumberInput,
    RWATableSelect,
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
                <FormattedNumber value={unitPrice} />
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
        serviceProviderFeeTypeId: serviceProviderFeeTypes[0]?.id ?? null,
        fees: null,
    };

    const editDefaultValues = item
        ? {
              type: item.type,
              entryTime: convertToDateTimeLocalFormat(item.entryTime),
              cashAmount: item.cashTransaction?.amount ?? null,
              fixedIncomeId: fixedIncomes[0]?.id ?? null,
              fixedIncomeAmount: item.fixedIncomeTransaction?.amount ?? null,
              serviceProviderFeeTypeId: item.serviceProviderFeeTypeId ?? null,
              fees: item.fees,
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
        const type = data.type;
        const entryTime = data.entryTime;
        const cashAmount = data.cashAmount;
        const fixedIncomeId = isAssetTransaction ? data.fixedIncomeId : null;
        const serviceProviderFeeTypeId = data.serviceProviderFeeTypeId ?? null;
        const fixedIncomeAmount = isAssetTransaction
            ? data.fixedIncomeAmount
            : null;
        const fees = canHaveTransactionFees ? data.fees : null;
        const formActions = {
            create: onSubmitCreate,
            edit: onSubmitEdit,
            delete: onSubmitDelete,
        };
        const onSubmitForm = formActions[operation];

        onSubmitForm?.({
            type,
            entryTime,
            cashAmount,
            fixedIncomeId,
            fixedIncomeAmount,
            serviceProviderFeeTypeId,
            fees,
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
                    required
                    control={control}
                    name="type"
                    disabled={operation === 'view'}
                    options={transactionTypeOptions}
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
                          required
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
                          required
                          name="fixedIncomeId"
                          disabled={operation === 'view'}
                          options={fixedIncomeOptions}
                          addItemButtonProps={{
                              onClick: () => setShowCreateAssetModal(true),
                              label: 'Create Asset',
                          }}
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
                          requiredErrorMessage="Quantity is required"
                          disabled={operation === 'view'}
                          control={control}
                          aria-invalid={
                              errors.fixedIncomeAmount?.type === 'required'
                                  ? 'true'
                                  : 'false'
                          }
                          errorMessage={errors.fixedIncomeAmount?.message}
                          placeholder="E.g. 1,000.00"
                      />
                  ),
              }
            : undefined,
        {
            label: 'Asset Proceeds',
            Input: () => (
                <>
                    <RWANumberInput
                        name="cashAmount"
                        requiredErrorMessage="Asset proceeds is required"
                        currency="USD"
                        disabled={operation === 'view'}
                        control={control}
                        aria-invalid={
                            errors.cashAmount?.type === 'required'
                                ? 'true'
                                : 'false'
                        }
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
