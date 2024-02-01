import { Icon } from '@/powerhouse';
import { CalendarDate } from '@internationalized/date';
import React from 'react';
import { Control, useForm } from 'react-hook-form';
import { RWAComponentMode } from '../../types';
import { RWAButton } from '../button';
import { RWAFeeInputs, RWAFeesTable, RWAFeesTableProps } from '../fees-table';
import { RWATxDetailInputs } from './form';
import { RWATxDatePicker } from './tx-date-picker';
import { RWATXRow } from './tx-row';
import { RWATxSelect, RWATxSelectProps } from './tx-select';
import { RWATxTextInput } from './tx-text-input';

const defaultLabels = {
    transaction: 'Transaction',
    editTransaction: 'Edit Transaction',
    saveEdits: 'Save Edits',
    cancelEdits: 'Cancel',
    assetType: 'Asset Type',
    timestamp: 'Timestamp',
    cusipIsinAssetName: 'CUSIP/Isin/Asset name',
    transactionType: 'Transaction Type',
    assetProceedsUSD: 'Asset Proceeds $USD',
    unitPrice: 'Unit Price',
    fees: 'Fees',
    cashBalanceChange: 'Cash Balance Change $',
    feesTable: {
        serviceProvider: 'Service Provider',
        feeType: 'Fee Type',
        accountID: 'Account ID',
        fee: 'Fee $ USD',
    },
};

export type RWATransactionFee = {
    id: string | number;
    serviceProvider: string;
    feeType: string;
    accountID: string;
    fee: number;
};

export type RWATransaction = {
    id: string | number;
    assetTypeId: string;
    timestamp: CalendarDate;
    cusipIsinAssetNameId: string;
    transactionType: string;
    assetProceedsUSD: string;
    unitPrice: string;
    fees: RWATransactionFee[];
    cashBalanceChange: string;
};
export interface RWATXDetailProps {
    mode?: RWAComponentMode;
    onEdit?: () => void;
    onSubmit: (data: RWATxDetailInputs) => void;
    onCancel: () => void;
    tx: RWATransaction;
    cusipIsinAssetNameOptions: RWATxSelectProps['options'];
    assetTypeOptions: RWATxSelectProps['options'];
    labels?: {
        transaction?: string;
        editTransaction?: string;
        saveEdits?: string;
        cancelEdits?: string;
        assetType?: string;
        timestamp?: string;
        cusipIsinAssetName?: string;
        transactionType?: string;
        assetProceedsUSD?: string;
        unitPrice?: string;
        fees?: string;
        feesTable?: RWAFeesTableProps['labels'];
        cashBalanceChange?: string;
    };
}

export const RWATXDetail: React.FC<RWATXDetailProps> = props => {
    const {
        tx,
        onEdit,
        onCancel,
        onSubmit,
        mode = 'view',
        assetTypeOptions,
        labels = defaultLabels,
        cusipIsinAssetNameOptions,
    } = props;

    const { control, handleSubmit } = useForm<RWATxDetailInputs>({
        defaultValues: {
            assetTypeId: tx.assetTypeId,
            timestamp: tx.timestamp,
            cusipIsinAssetNameId: tx.cusipIsinAssetNameId,
            transactionType: tx.transactionType,
            assetProceedsUSD: tx.assetProceedsUSD,
            feesTable: tx.fees,
        },
    });

    const isEditMode = mode === 'edit';

    return (
        <div className="flex flex-col overflow-hidden rounded-md border border-gray-300">
            <div className="flex justify-between border-b border-gray-300 bg-gray-100 p-3 font-semibold text-gray-800">
                <div className="flex items-center">{`${labels.transaction} #${tx.id}`}</div>
                {isEditMode ? (
                    <div className="flex gap-x-2">
                        <RWAButton onClick={onCancel} className="text-gray-600">
                            {labels.cancelEdits}
                        </RWAButton>
                        <RWAButton
                            onClick={handleSubmit(onSubmit)}
                            iconPosition="right"
                            icon={<Icon name="save" size={16} />}
                        >
                            {labels.saveEdits}
                        </RWAButton>
                    </div>
                ) : (
                    <RWAButton
                        onClick={onEdit}
                        iconPosition="right"
                        icon={<Icon name="pencil" size={16} />}
                    >
                        {labels.editTransaction}
                    </RWAButton>
                )}
            </div>
            <div>
                <RWATXRow
                    label={labels.assetType}
                    hideLine={isEditMode}
                    value={
                        <RWATxSelect
                            control={control}
                            name="assetTypeId"
                            disabled={!isEditMode}
                            options={assetTypeOptions}
                        />
                    }
                />
                <RWATXRow
                    label={labels.timestamp}
                    hideLine={isEditMode}
                    value={
                        <RWATxDatePicker
                            control={control}
                            name="timestamp"
                            disabled={!isEditMode}
                        />
                    }
                />
                <RWATXRow
                    label={labels.cusipIsinAssetName}
                    hideLine={isEditMode}
                    value={
                        <RWATxSelect
                            control={control}
                            disabled={!isEditMode}
                            name="cusipIsinAssetNameId"
                            options={cusipIsinAssetNameOptions}
                        />
                    }
                />
                <RWATXRow
                    label={labels.transactionType}
                    hideLine={isEditMode}
                    value={
                        <RWATxTextInput
                            control={control}
                            name="transactionType"
                            disabled={!isEditMode}
                        />
                    }
                />
                <RWATXRow
                    label={labels.assetProceedsUSD}
                    hideLine={isEditMode}
                    value={
                        <div className="flex flex-col items-end">
                            <div>
                                <RWATxTextInput
                                    control={control}
                                    name="assetProceedsUSD"
                                    disabled={!isEditMode}
                                />
                            </div>
                            <div className="mt-[10px] flex">
                                <div className="mr-8 text-gray-600">
                                    {labels.unitPrice}
                                </div>
                                <div>{tx.unitPrice}</div>
                            </div>
                        </div>
                    }
                />
                <div className="bg-gray-50">
                    <RWATXRow
                        hideLine
                        className="gap-x-16 [&>div:nth-child(1)]:min-w-0 [&>div:nth-child(2)]:min-w-0 [&>div:nth-child(2)]:flex-1"
                        label={labels.fees}
                        value={
                            <RWAFeesTable
                                control={
                                    control as unknown as Control<RWAFeeInputs>
                                }
                                mode={mode}
                                labels={labels.feesTable}
                            />
                        }
                    />
                </div>
            </div>
            <div className="border-t border-gray-300 bg-gray-100">
                <RWATXRow
                    label={labels.cashBalanceChange}
                    value={tx.cashBalanceChange}
                    className="text-sm font-semibold"
                />
            </div>
        </div>
    );
};
