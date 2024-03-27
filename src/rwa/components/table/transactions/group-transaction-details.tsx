import { DateTimeLocalInput } from '@/connect';
import {
    FeeTransactionsTable,
    FixedIncome,
    FormattedNumber,
    GroupTransactionDetailsProps,
    GroupTransactionFormInputs,
    GroupTransactionType,
    ItemDetails,
    RWAFormRow,
    RWANumberInput,
    RWATableSelect,
    TransactionFee,
    convertToDateTimeLocalFormat,
    groupTransactionTypeLabels,
    groupTransactionTypes,
} from '@/rwa';
import { InputMaybe } from 'document-model/document';
import { SubmitHandler, useFieldArray, useForm } from 'react-hook-form';

function calculateUnitPricePercent(
    cashAmount: InputMaybe<number>,
    fixedIncomeAmount: InputMaybe<number>,
) {
    if (!cashAmount || !fixedIncomeAmount) return 0;
    return ((cashAmount / fixedIncomeAmount) * 100).toFixed(2);
}

function calculateCashBalanceChange(
    transactionType: InputMaybe<GroupTransactionType>,
    cashAmount: InputMaybe<number>,
    fees: InputMaybe<TransactionFee[]>,
) {
    if (!cashAmount || !transactionType) return 0;

    const operation = transactionType === 'AssetPurchase' ? -1 : 1;

    const feeAmounts = fees?.map(fee => fee.amount).filter(Boolean) ?? [];

    const totalFees = feeAmounts.reduce((acc, fee) => acc + fee, 0);

    return cashAmount * operation - totalFees;
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

    const currentlySupportedGroupTransactionTypes = [
        'AssetPurchase',
        'AssetSale',
    ] as const;

    const transactionTypeOptions = groupTransactionTypes
        .filter(type => currentlySupportedGroupTransactionTypes.includes(type))
        .map(type => ({
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
        defaultValues: {
            type: item?.type ?? currentlySupportedGroupTransactionTypes[0],
            entryTime: convertToDateTimeLocalFormat(
                item?.entryTime ?? new Date(),
            ),
            cashAmount: item?.cashTransaction?.amount ?? undefined,
            fixedIncomeId: fixedIncome?.id ?? fixedIncomes[0]?.id,
            fixedIncomeAmount:
                item?.fixedIncomeTransaction?.amount ?? undefined,
            fees: item?.fees ?? undefined,
        },
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: 'fees', // Name of the field array in your form
    });

    const cashAmount = watch('cashAmount');
    const fixedIncomeAmount = watch('fixedIncomeAmount');
    const type = watch('type');
    const fees = watch('fees');
    const unitPricePercent = calculateUnitPricePercent(
        cashAmount,
        fixedIncomeAmount,
    );
    const cashBalanceChange = calculateCashBalanceChange(
        type,
        cashAmount,
        fees,
    );

    const onSubmit: SubmitHandler<GroupTransactionFormInputs> = data => {
        onSubmitForm({
            ...data,
            cashBalanceChange,
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
                                errors.fixedIncomeAmount?.type === 'required'
                                    ? 'true'
                                    : 'false'
                            }
                            errorMessage={errors.fixedIncomeAmount?.message}
                            placeholder="E.g. 1,000.00"
                        />
                    }
                />
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
                <div className="my-2 ml-auto mr-6 w-fit text-xs">
                    <span className="mr-2 inline-block text-gray-600">
                        Unit Price
                    </span>{' '}
                    <span className="text-gray-900">{unitPricePercent}%</span>
                </div>
            </div>
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

    const formProps = {
        formInputs,
        handleSubmit,
        onSubmit,
        reset,
        onCancel,
    };

    return <ItemDetails {...props} {...formProps} />;
}
