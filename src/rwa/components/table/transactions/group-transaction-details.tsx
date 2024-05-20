import { DateTimeLocalInput } from '@/connect';
import {
    FEES_PAYMENT,
    FeeTransactionsTable,
    FormattedNumber,
    GroupTransactionDetailsProps,
    GroupTransactionFormInputs,
    ItemDetails,
    RWANumberInput,
    RWATableSelect,
    allGroupTransactionTypes,
    assetGroupTransactions,
    calculateCashBalanceChange,
    calculateUnitPrice,
    convertToDateTimeLocalFormat,
    getFixedIncomeAssets,
    groupTransactionTypeLabels,
    makeFixedIncomeOptionLabel,
} from '@/rwa';
import { useState } from 'react';
import {
    Control,
    SubmitHandler,
    useFieldArray,
    useForm,
    useWatch,
} from 'react-hook-form';
import { twMerge } from 'tailwind-merge';
import { FormInputs } from '../../inputs/form-inputs';
import { CreateAssetModal } from '../../modal/create-asset-modal';
import { CreateServiceProviderFeeTypeModal } from '../../modal/create-service-provider-fee-type-modal';
import { useAssetForm } from '../assets/useAssetForm';
import { useServiceProviderFeeTypeForm } from '../service-provider-fee-types/useServiceProviderFeeTypeForm';

function CashBalanceChange(props: {
    control: Control<GroupTransactionFormInputs>;
}) {
    const { control } = props;
    const cashAmount = useWatch({ control, name: 'cashAmount' });
    const type = useWatch({ control, name: 'type' });
    const fees = useWatch({ control, name: 'fees' });

    const cashBalanceChange = calculateCashBalanceChange(
        type,
        cashAmount,
        fees,
    );

    return (
        <>
            <div className="flex items-center justify-between border-t border-gray-300 bg-gray-100 p-3 font-semibold text-gray-800">
                <div className="mr-6 text-sm text-gray-600">
                    Cash Balance Change $USD
                </div>
                <div className="h-px flex-1 border-b border-dashed border-gray-400" />
                <div className="pl-8 text-sm text-gray-900">
                    <FormattedNumber value={cashBalanceChange} />
                </div>
            </div>
        </>
    );
}

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

export function GroupTransactionDetails(props: GroupTransactionDetailsProps) {
    const {
        state,
        item,
        operation,
        onCancel,
        onSubmitForm,
        onSubmitDelete,
        onSubmitCreateAsset,
        onSubmitCreateServiceProviderFeeType,
    } = props;
    const [showCreateAssetModal, setShowCreateAssetModal] = useState(false);
    const [
        showCreateServiceProviderFeeTypeModal,
        setShowCreateServiceProviderFeeTypeModal,
    ] = useState(false);
    const { serviceProviderFeeTypes, accounts, fixedIncomeTypes, spvs } = state;
    const fixedIncomes = getFixedIncomeAssets(state);
    const transactionTypeOptions = allGroupTransactionTypes.map(type => ({
        label: groupTransactionTypeLabels[type],
        value: type,
    }));
    const fixedIncomeOptions = fixedIncomes.map(fixedIncome => ({
        label: makeFixedIncomeOptionLabel(fixedIncome),
        value: fixedIncome.id,
    }));

    const fixedIncome = fixedIncomes.find(
        ({ id }) => id === item?.fixedIncomeTransaction?.assetId,
    );

    const {
        control,
        handleSubmit,
        reset,
        register,
        watch,
        formState: { errors },
    } = useForm<GroupTransactionFormInputs>({
        mode: 'onBlur',
        defaultValues: {
            type: item?.type ?? allGroupTransactionTypes[0],
            entryTime: convertToDateTimeLocalFormat(
                item?.entryTime ?? new Date(),
            ),
            cashAmount: item?.cashTransaction?.amount,
            fixedIncomeId: fixedIncome?.id ?? fixedIncomes[0]?.id,
            fixedIncomeAmount: item?.fixedIncomeTransaction?.amount,
            fees: item?.fees,
        },
    });

    const assetFormProps = useAssetForm({
        defaultValues: {
            fixedIncomeTypeId: fixedIncomeTypes[0]?.id,
            spvId: spvs[0]?.id,
            maturity: convertToDateTimeLocalFormat(new Date()),
        },
        state,
        onSubmitForm: data => {
            setShowCreateAssetModal(false);
            onSubmitCreateAsset(data);
        },
        operation: 'create',
    });

    const serviceProviderFeeTypeFormProps = useServiceProviderFeeTypeForm({
        defaultValues: {
            accountId: accounts[0]?.id,
        },
        state,
        onSubmitForm: data => {
            setShowCreateServiceProviderFeeTypeModal(false);
            onSubmitCreateServiceProviderFeeType(data);
        },
        operation: 'create',
    });

    const type = useWatch({ control, name: 'type' });

    const isAssetTransaction = assetGroupTransactions.includes(
        type ?? allGroupTransactionTypes[0],
    );
    const canHaveTransactionFees = type !== FEES_PAYMENT;

    const { fields, append, remove } = useFieldArray({
        control,
        name: 'fees',
    });

    const onSubmit: SubmitHandler<GroupTransactionFormInputs> = data => {
        const type = data.type;
        const entryTime = data.entryTime;
        const cashAmount = data.cashAmount;
        const fixedIncomeId = isAssetTransaction ? data.fixedIncomeId : null;
        const fixedIncomeAmount = isAssetTransaction
            ? data.fixedIncomeAmount
            : null;
        const fees = canHaveTransactionFees ? data.fees : null;
        const cashBalanceChange = calculateCashBalanceChange(
            data.type,
            data.cashAmount,
            data.fees,
        );
        const unitPrice = calculateUnitPrice(
            data.cashAmount,
            data.fixedIncomeAmount,
        );

        onSubmitForm({
            type,
            entryTime,
            cashAmount,
            fixedIncomeId,
            fixedIncomeAmount,
            fees,
            cashBalanceChange,
            unitPrice,
        });
    };

    const onDelete = (itemId: string) => {
        onSubmitDelete(itemId);
    };

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

    const formInputs = () => (
        <>
            <FormInputs inputs={inputs} />
            {canHaveTransactionFees && (
                <FeeTransactionsTable
                    register={register}
                    feeInputs={fields}
                    serviceProviderFeeTypes={serviceProviderFeeTypes}
                    setShowServiceProviderFeeTypeModal={
                        setShowCreateServiceProviderFeeTypeModal
                    }
                    accounts={accounts}
                    control={control}
                    watch={watch}
                    remove={remove}
                    append={append}
                    errors={errors}
                    isViewOnly={operation === 'view'}
                />
            )}
            <CashBalanceChange control={control} />
        </>
    );

    const submit = handleSubmit(onSubmit);

    const formProps = {
        formInputs,
        submit,
        reset,
        onCancel,
        onDelete,
    };

    return (
        <>
            <ItemDetails {...props} {...formProps} />
            {showCreateAssetModal && (
                <CreateAssetModal
                    {...assetFormProps}
                    state={state}
                    open={showCreateAssetModal}
                    onOpenChange={setShowCreateAssetModal}
                    onSubmitForm={onSubmitCreateAsset}
                />
            )}
            {showCreateServiceProviderFeeTypeModal && (
                <CreateServiceProviderFeeTypeModal
                    {...serviceProviderFeeTypeFormProps}
                    state={state}
                    open={showCreateServiceProviderFeeTypeModal}
                    onOpenChange={setShowCreateServiceProviderFeeTypeModal}
                    onSubmitForm={onSubmitCreateServiceProviderFeeType}
                />
            )}
        </>
    );
}
