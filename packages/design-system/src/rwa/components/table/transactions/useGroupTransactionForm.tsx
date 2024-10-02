import { DateTimeLocalInput, Tooltip, TooltipProvider } from '@/connect';
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
    formatDateForDisplay,
    getFixedIncomeAssets,
    groupTransactionTypeLabels,
    makeFixedIncomeOptionLabel,
} from '@/rwa';

import { getIsTransaction } from '@/services/viem';
import {
    ComponentPropsWithRef,
    ForwardedRef,
    forwardRef,
    useMemo,
    useState,
} from 'react';
import { Control, useFieldArray, useWatch } from 'react-hook-form';
import { twMerge } from 'tailwind-merge';
import { useSubmit } from '../hooks/useSubmit';

const TransactionReference = forwardRef(function TransactionReference(
    props: ComponentPropsWithRef<typeof RWATableTextInput> & {
        readonly control: Control<GroupTransactionFormInputs>;
    },
    ref: ForwardedRef<HTMLInputElement>,
) {
    const { control, disabled } = props;
    const value = useWatch({ control, name: 'txRef' });
    const maxLength = 46;
    const shouldShortenValue =
        typeof value === 'string' && value.length >= maxLength;
    const maybeShortenedValue = shouldShortenValue
        ? `${value.slice(0, maxLength)}...`
        : value;
    const isTransaction = getIsTransaction(value);

    const tooltipContent = (
        <div>
            <p>{value}</p>
            {isTransaction ? (
                <p className="mt-2 text-center">
                    <a
                        className="text-blue-900 underline"
                        href={`https://etherscan.io/tx/${value}`}
                    >
                        View on Etherscan
                    </a>
                </p>
            ) : null}
        </div>
    );

    if (disabled)
        return (
            <TooltipProvider>
                <Tooltip content={tooltipContent}>
                    <span>{maybeShortenedValue}</span>
                </Tooltip>
            </TooltipProvider>
        );

    return <RWATableTextInput {...props} ref={ref} />;
});

function UnitPrice(props: {
    readonly control: Control<GroupTransactionFormInputs>;
    readonly isViewOnly: boolean;
}) {
    const { control } = props;

    const cashAmount = useWatch({ control, name: 'cashAmount' });
    const fixedIncomeAmount = useWatch({ control, name: 'fixedIncomeAmount' });

    const unitPrice = calculateUnitPrice(cashAmount, fixedIncomeAmount);

    return (
        <div className={twMerge('mt-1 w-fit', !props.isViewOnly && 'ml-auto')}>
            <span className="text-gray-600">Unit Price</span>{' '}
            <span className="text-gray-900">
                <FormattedNumber decimalScale={6} value={unitPrice} />
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

    const createDefaultValues: GroupTransactionFormInputs = {
        type: allGroupTransactionTypes[0],
        entryTime: convertToDateTimeLocalFormat(new Date()),
        cashAmount: null,
        fixedIncomeId: fixedIncomes[0]?.id ?? null,
        fixedIncomeAmount: null,
        serviceProviderFeeTypeId: null,
        fees: null,
        txRef: null,
    };

    const editDefaultValues: GroupTransactionFormInputs = item
        ? {
              id: item.id,
              type: item.type,
              entryTime: convertToDateTimeLocalFormat(item.entryTime),
              cashAmount: item.cashTransaction.amount ?? null,
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

    const entryTimeInputValue =
        watch('entryTime') || formState.defaultValues?.entryTime;

    const inputs = [
        {
            label: 'Transaction Type',
            Input: () => (
                <RWATableSelect
                    aria-invalid={errors.type ? 'true' : 'false'}
                    control={control}
                    disabled={operation === 'view'}
                    errorMessage={errors.type?.message}
                    name="type"
                    options={transactionTypeOptions}
                    rules={{ required: 'Transaction type is required' }}
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
            inputLabel: entryTimeInputValue
                ? formatDateForDisplay(new Date(entryTimeInputValue))
                : null,
        },
        isFeesTransaction
            ? {
                  label: 'Service Provider',
                  Input: () => (
                      <RWATableSelect
                          addItemButtonProps={{
                              onClick: () =>
                                  setShowCreateServiceProviderFeeTypeModal(
                                      true,
                                  ),
                              label: 'Add Service Provider',
                          }}
                          control={control}
                          disabled={operation === 'view'}
                          name="serviceProviderFeeTypeId"
                          options={serviceProviderFeeTypeOptions}
                      />
                  ),
              }
            : null,
        isAssetTransaction
            ? {
                  label: 'Asset name',
                  Input: () => (
                      <RWATableSelect
                          addItemButtonProps={{
                              onClick: () => setShowCreateAssetModal(true),
                              label: 'Create Asset',
                          }}
                          aria-invalid={errors.type ? 'true' : 'false'}
                          control={control}
                          disabled={operation === 'view'}
                          errorMessage={errors.type?.message}
                          name="fixedIncomeId"
                          options={fixedIncomeOptions}
                          rules={{ required: 'Asset name is required' }}
                      />
                  ),
              }
            : undefined,
        isAssetTransaction
            ? {
                  label: 'Quantity',
                  Input: () => (
                      <RWANumberInput
                          aria-invalid={
                              errors.fixedIncomeAmount ? 'true' : 'false'
                          }
                          control={control}
                          disabled={operation === 'view'}
                          errorMessage={errors.fixedIncomeAmount?.message}
                          name="fixedIncomeAmount"
                          placeholder="E.g. 1,000.00"
                          rules={{
                              required: 'Quantity is required',
                              validate: {
                                  positive: value =>
                                      (!!value && Number(value) > 0) ||
                                      'Asset proceeds must be greater than zero',
                              },
                          }}
                      />
                  ),
              }
            : undefined,
        {
            label: isAssetTransaction ? 'Asset Proceeds' : 'Cash Amount',
            Input: () => (
                <>
                    <RWANumberInput
                        aria-invalid={errors.cashAmount ? 'true' : 'false'}
                        control={control}
                        currency="USD"
                        disabled={operation === 'view'}
                        errorMessage={errors.cashAmount?.message}
                        name="cashAmount"
                        placeholder="E.g. $1,000.00"
                        rules={{
                            required: 'Asset proceeds is required',
                            validate: {
                                positive: value =>
                                    (!!value && Number(value) > 0) ||
                                    'Asset proceeds must be greater than zero',
                            },
                        }}
                    />
                    {isAssetTransaction ? (
                        <UnitPrice
                            control={control}
                            isViewOnly={operation === 'view'}
                        />
                    ) : null}
                </>
            ),
        },
        {
            label: 'Transaction reference',
            Input: () => (
                <TransactionReference
                    {...register('txRef', {
                        disabled: operation === 'view',
                    })}
                    aria-invalid={errors.txRef ? 'true' : 'false'}
                    control={control}
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
