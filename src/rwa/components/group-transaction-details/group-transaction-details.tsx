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
import { Maybe } from 'document-model/document';
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
    type: GroupTransactionType | undefined;
    entryTime: string | undefined;
    cashAmount: number | undefined;
    fixedIncomeId: string | undefined;
    fixedIncomeAmount: number | undefined;
    fees: Maybe<TransactionFee[]> | undefined;
    cashBalanceChange: number | undefined;
};

function calculateUnitPricePercent(
    cashAmount: number | undefined,
    fixedIncomeAmount: number | undefined,
) {
    if (!cashAmount || !fixedIncomeAmount) return 0;
    return ((cashAmount / fixedIncomeAmount) * 100).toFixed(2);
}

function calculateCashBalanceChange(
    transactionType: GroupTransactionType | undefined,
    cashAmount: number | undefined,
    fees: Maybe<TransactionFee[]> | undefined,
) {
    if (!cashAmount || !transactionType) return 0;

    const operation = transactionType === 'AssetPurchase' ? -1 : 1;

    const totalFees = fees
        ? fees.reduce((acc, fee) => acc + Number(fee.amount), 0)
        : 0;

    return Number(cashAmount) * operation - totalFees;
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

    const { control, handleSubmit, reset, register, watch } =
        useForm<GroupTransactionDetailInputs>({
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
            cashAmount: Number(data.cashAmount),
            fixedIncomeAmount: Number(data.fixedIncomeAmount),
            fees: data.fees?.map(fee => ({
                ...fee,
                amount: Number(fee.amount),
            })),
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
                            control={control}
                            required
                            name="fixedIncomeAmount"
                            disabled={isViewOnly}
                        />
                    }
                />
                <RWAFormRow
                    label="Asset Proceeds $USD"
                    hideLine={!isViewOnly}
                    value={
                        <RWATableTextInput
                            control={control}
                            required
                            name="cashAmount"
                            disabled={isViewOnly}
                        />
                    }
                />
                <div className="mb-2 ml-auto mr-6 w-fit text-xs">
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
