import { DateTimeLocalInput } from '@/connect/components/date-time-input';
import { DivProps, Icon, mergeClassNameProps } from '@/powerhouse';
import {
    FixedIncome,
    GroupTransaction,
    GroupTransactionType,
    ServiceProviderFeeType,
    TransactionFee,
    convertToDateTimeLocalFormat,
} from '@/rwa';
import {
    groupTransactionTypeLabels,
    groupTransactionTypes,
} from '@/rwa/constants/transactions';
import { InputMaybe } from 'document-model/document';
import React from 'react';
import {
    SubmitHandler,
    UseFormReset,
    useFieldArray,
    useForm,
} from 'react-hook-form';
import { RWAButton } from '../button';
import { RWAFormRow, RWATableSelect, RWATableTextInput } from '../table-inputs';
import { FeeTransactionsTable } from '../table/fee-transactions-table';

export type GroupTransactionDetailInputs = {
    type: InputMaybe<GroupTransactionType>;
    entryTime: InputMaybe<string>;
    cashAmount: InputMaybe<number>;
    fixedIncomeId: InputMaybe<string>;
    fixedIncomeAmount: InputMaybe<number>;
    fees: InputMaybe<TransactionFee[]>;
    cashBalanceChange: InputMaybe<number>;
};

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

export interface GroupTransactionsDetailsProps extends DivProps {
    transaction: Partial<GroupTransaction> | undefined;
    operation: 'view' | 'create' | 'edit';
    fixedIncomes: FixedIncome[];
    serviceProviderFeeTypes: ServiceProviderFeeType[];
    transactionNumber: number;
    onCancel: (reset: UseFormReset<GroupTransactionDetailInputs>) => void;
    selectItemToEdit?: () => void;
    onSubmitForm: (data: GroupTransactionDetailInputs) => void;
}
export const GroupTransactionDetails: React.FC<
    GroupTransactionsDetailsProps
> = props => {
    const {
        transaction,
        operation = 'view',
        fixedIncomes,
        onCancel,
        selectItemToEdit,
        onSubmitForm,
        serviceProviderFeeTypes,
        transactionNumber,
        ...restProps
    } = props;

    const currentlySupportedGroupTransactionTypes = [
        'AssetPurchase',
        'AssetSale',
    ];

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
        ({ id }) => id === transaction?.fixedIncomeTransaction?.assetId,
    );

    const {
        control,
        handleSubmit,
        reset,
        register,
        watch,
        formState: { errors },
    } = useForm<GroupTransactionDetailInputs>({
        defaultValues: {
            type: transaction?.type,
            entryTime: convertToDateTimeLocalFormat(
                transaction?.entryTime ?? new Date(),
            ),
            cashAmount: transaction?.cashTransaction?.amount,
            fixedIncomeId: fixedIncome?.id,
            fixedIncomeAmount: transaction?.fixedIncomeTransaction?.amount,
            fees: transaction?.fees,
        },
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: 'fees', // Name of the field array in your form
    });

    const isEditOperation = operation === 'edit';
    const isCreateOperation = operation === 'create';
    const isViewOnly = !isCreateOperation && !isEditOperation;
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

    const onSubmit: SubmitHandler<GroupTransactionDetailInputs> = data => {
        onSubmitForm({
            ...data,
            cashBalanceChange,
        });
    };

    return (
        <div
            {...mergeClassNameProps(
                restProps,
                'flex flex-col overflow-hidden rounded-md border border-gray-300 bg-white',
            )}
        >
            <div className="flex justify-between border-b border-gray-300 bg-gray-100 p-3 font-semibold text-gray-800">
                <div className="flex items-center">
                    Transaction #{transactionNumber}
                </div>
                {isEditOperation || isCreateOperation ? (
                    <div className="flex gap-x-2">
                        <RWAButton
                            onClick={() => onCancel(reset)}
                            className="text-gray-600"
                        >
                            Cancel
                        </RWAButton>
                        <RWAButton
                            onClick={handleSubmit(onSubmit)}
                            iconPosition="right"
                            icon={<Icon name="save" size={16} />}
                        >
                            {isCreateOperation
                                ? 'Save New Transaction'
                                : 'Save Edits'}
                        </RWAButton>
                    </div>
                ) : (
                    <RWAButton
                        onClick={selectItemToEdit}
                        iconPosition="right"
                        icon={<Icon name="pencil" size={16} />}
                    >
                        Edit Transaction
                    </RWAButton>
                )}
            </div>
            <div>
                <RWAFormRow
                    label="Transaction Type"
                    hideLine={!isViewOnly}
                    value={
                        <RWATableSelect
                            required
                            control={control}
                            name="type"
                            disabled={isViewOnly}
                            options={transactionTypeOptions}
                        />
                    }
                />
                <RWAFormRow
                    label="Entry Time"
                    hideLine={!isViewOnly}
                    value={
                        <DateTimeLocalInput
                            {...register('entryTime', {
                                required: true,
                                disabled: isViewOnly,
                            })}
                            name="entryTime"
                            className="disabled:bg-transparent"
                        />
                    }
                />
                <RWAFormRow
                    label="Asset name"
                    hideLine={!isViewOnly}
                    value={
                        <RWATableSelect
                            control={control}
                            required
                            name="fixedIncomeId"
                            disabled={isViewOnly}
                            options={fixedIncomeOptions}
                        />
                    }
                />
                <RWAFormRow
                    label="Quantity"
                    hideLine={!isViewOnly}
                    value={
                        <RWATableTextInput
                            {...register('fixedIncomeAmount', {
                                required: 'Quantity is required',
                                disabled: isViewOnly,
                                valueAsNumber: true,
                            })}
                            aria-invalid={
                                errors.fixedIncomeAmount?.type === 'required'
                                    ? 'true'
                                    : 'false'
                            }
                            errorMessage={errors.fixedIncomeAmount?.message}
                            type="number"
                            placeholder="E.g. 1000"
                        />
                    }
                />
                <RWAFormRow
                    label="Asset Proceeds $USD"
                    hideLine={!isViewOnly}
                    value={
                        <RWATableTextInput
                            {...register('cashAmount', {
                                required: 'Asset proceeds is required',
                                disabled: isViewOnly,
                                valueAsNumber: true,
                            })}
                            aria-invalid={
                                errors.cashAmount?.type === 'required'
                                    ? 'true'
                                    : 'false'
                            }
                            errorMessage={errors.cashAmount?.message}
                            type="number"
                            placeholder="E.g. 1000"
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
                isViewOnly={isViewOnly}
            />
            <div className="flex items-center justify-between border-t border-gray-300 bg-gray-100 p-3 font-semibold text-gray-800">
                <div className="mr-6 text-sm text-gray-600">
                    Cash Balance Change $USD
                </div>
                <div className="h-px flex-1 border-b border-dashed border-gray-400" />
                <div className="pl-8 text-sm text-gray-900">
                    {cashBalanceChange}
                </div>
            </div>
        </div>
    );
};
