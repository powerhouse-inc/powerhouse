import { DateTimeLocalInput } from '@/connect';
import {
    ASSET_SALE,
    FEES_PAYMENT,
    FeeTransactionsTable,
    FixedIncome,
    FormattedNumber,
    GroupTransactionDetailsProps,
    GroupTransactionFormInputs,
    GroupTransactionType,
    ItemDetails,
    PRINCIPAL_RETURN,
    RWAFormRow,
    RWANumberInput,
    RWATableSelect,
    TransactionFeeInput,
    allGroupTransactionTypes,
    assetGroupTransactions,
    convertToDateTimeLocalFormat,
    groupTransactionTypeLabels,
} from '@/rwa';
import { InputMaybe } from 'document-model/document';
import {
    Control,
    SubmitHandler,
    useFieldArray,
    useForm,
    useWatch,
} from 'react-hook-form';

function calculateUnitPrice(
    cashAmount: InputMaybe<number>,
    fixedIncomeAmount: InputMaybe<number>,
) {
    if (!cashAmount || !fixedIncomeAmount) return 0;
    return (cashAmount / fixedIncomeAmount).toFixed(2);
}

function calculateCashBalanceChange(
    transactionType: InputMaybe<GroupTransactionType>,
    cashAmount: InputMaybe<number>,
    fees: InputMaybe<TransactionFeeInput[]>,
) {
    if (!cashAmount || !transactionType) return 0;

    const operation =
        transactionType === ASSET_SALE || transactionType === PRINCIPAL_RETURN
            ? 1
            : -1;

    const feeAmounts = fees?.map(fee => fee.amount).filter(Boolean) ?? [];

    const totalFees = feeAmounts.reduce((acc, fee) => acc + fee, 0);

    return cashAmount * operation - totalFees;
}

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

function UnitPrice(props: { control: Control<GroupTransactionFormInputs> }) {
    const { control } = props;

    const cashAmount = useWatch({ control, name: 'cashAmount' });
    const fixedIncomeAmount = useWatch({ control, name: 'fixedIncomeAmount' });

    const unitPrice = calculateUnitPrice(cashAmount, fixedIncomeAmount);

    return (
        <div className="my-2 ml-auto mr-6 w-fit text-xs">
            <span className="mr-2 inline-block text-gray-600">Unit Price</span>{' '}
            <span className="text-gray-900">{unitPrice}</span>
        </div>
    );
}

export function GroupTransactionDetails(props: GroupTransactionDetailsProps) {
    const {
        fixedIncomes,
        serviceProviderFeeTypes,
        item,
        operation,
        onCancel,
        onSubmitForm,
    } = props;
    const transactionTypeOptions = allGroupTransactionTypes.map(type => ({
        label: groupTransactionTypeLabels[type],
        id: type,
    }));
    const fixedIncomeOptions = fixedIncomes.map(fixedIncome => ({
        label: makeFixedIncomeOptionLabel(fixedIncome),
        id: fixedIncome.id,
    }));
    function makeFixedIncomeOptionLabel(fixedIncome: FixedIncome) {
        let label = fixedIncome.name;
        if (fixedIncome.ISIN) {
            label += ` - ${fixedIncome.ISIN}`;
        }
        if (fixedIncome.CUSIP) {
            label += ` - ${fixedIncome.CUSIP}`;
        }
        return label;
    }
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
            cashAmount: item?.cashTransaction?.amount ?? null,
            fixedIncomeId:
                fixedIncome?.id ?? fixedIncomes.length > 0
                    ? fixedIncomes[0].id
                    : null,
            fixedIncomeAmount: item?.fixedIncomeTransaction?.amount ?? null,
            fees: item?.fees ?? null,
        },
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
        const cashBalanceChange = calculateCashBalanceChange(
            data.type,
            data.cashAmount,
            data.fees,
        );
        const fixedIncomeId = isAssetTransaction ? data.fixedIncomeId : null;
        const fixedIncomeAmount = isAssetTransaction
            ? data.fixedIncomeAmount
            : null;
        const fees = canHaveTransactionFees ? data.fees : null;

        onSubmitForm({
            type,
            entryTime,
            cashAmount,
            cashBalanceChange,
            fixedIncomeId,
            fixedIncomeAmount,
            fees,
        });
    };

    const formInputs = () => (
        <>
            <div>
                <RWAFormRow
                    label="Transaction Type"
                    hideLine={operation !== 'view'}
                    value={
                        <RWATableSelect
                            required
                            control={control}
                            name="type"
                            disabled={operation === 'view'}
                            options={transactionTypeOptions}
                        />
                    }
                />
                <RWAFormRow
                    label="Entry Time"
                    hideLine={operation !== 'view'}
                    value={
                        <DateTimeLocalInput
                            {...register('entryTime', {
                                required: true,
                                disabled: operation === 'view',
                            })}
                            name="entryTime"
                        />
                    }
                />
                {isAssetTransaction && (
                    <RWAFormRow
                        label="Asset name"
                        hideLine={operation !== 'view'}
                        value={
                            <RWATableSelect
                                control={control}
                                required
                                name="fixedIncomeId"
                                disabled={operation === 'view'}
                                options={fixedIncomeOptions}
                            />
                        }
                    />
                )}
                {isAssetTransaction && (
                    <RWAFormRow
                        label="Quantity"
                        hideLine={operation !== 'view'}
                        value={
                            <RWANumberInput
                                name="fixedIncomeAmount"
                                requiredErrorMessage="Quantity is required"
                                disabled={operation === 'view'}
                                control={control}
                                aria-invalid={
                                    errors.fixedIncomeAmount?.type ===
                                    'required'
                                        ? 'true'
                                        : 'false'
                                }
                                errorMessage={errors.fixedIncomeAmount?.message}
                                placeholder="E.g. 1,000.00"
                            />
                        }
                    />
                )}
                <RWAFormRow
                    label="Asset Proceeds"
                    hideLine={operation !== 'view'}
                    value={
                        <RWANumberInput
                            name="cashAmount"
                            requiredErrorMessage="Asset Proceeds is required"
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
                    }
                />
                {isAssetTransaction && <UnitPrice control={control} />}
            </div>
            {canHaveTransactionFees && (
                <FeeTransactionsTable
                    register={register}
                    feeInputs={fields}
                    serviceProviderFeeTypes={serviceProviderFeeTypes}
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

    const formProps = {
        formInputs,
        handleSubmit,
        onSubmit,
        reset,
        onCancel,
    };

    return <ItemDetails {...props} {...formProps} />;
}
