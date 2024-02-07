import { DivProps, Icon, mergeClassNameProps } from '@/powerhouse';
import { CalendarDate } from '@internationalized/date';
import React from 'react';
import { UseFormReset, useForm } from 'react-hook-form';
import { RWAComponentMode } from '../../types';
import { RWAButton } from '../button';
import {
    RWAFormRow,
    RWATableDatePicker,
    RWATableSelect,
    RWATableSelectProps,
    RWATableTextInput,
} from '../table-inputs';
import { RWAAssetDetailInputs } from './form';

const defaultLabels = {
    title: 'Asset Details',
    editAsset: 'Edit Asset',
    saveEdits: 'Save Edits',
    cancelEdits: 'Cancel',
    purchaseTimestamp: 'Purchase Timestamp',
    assetType: 'Asset Type',
    maturityDate: 'Maturity Date',
    cusip: 'CUSIP',
    isin: 'ISIN',
    assetName: 'Asset Name',
    notional: 'Notional',
    purchaseProceeds: 'Purchase Proceeds $USD',
    unitPrice: 'Unit Price',
    totalDiscount: 'Total Discount',
    currentValue: 'Current Value',
    realisedSurplus: 'Realised Surplus',
    totalSurplus: 'Total Surplus',
    saveNewAsset: 'Save New Asset',
};

export type RWAAssetDetail = {
    id: string;
    purchaseTimestamp: CalendarDate;
    assetTypeId: string;
    maturityDate: string;
    cusip: string;
    isin: string;
    assetName: string;
    notional: string;
    purchaseProceeds: string;
    unitPrice: string;
    totalDiscount: string;
    currentValue: string;
    realisedSurplus: string;
    totalSurplus: string;
};

export interface RWAAssetDetailsProps extends DivProps {
    operation?: 'create' | 'edit';
    mode?: RWAComponentMode;
    onClose?: () => void;
    onCancel: (reset: UseFormReset<RWAAssetDetailInputs>) => void;
    onEdit: () => void;
    onSubmitForm: (
        data: RWAAssetDetailInputs,
        resetForm: UseFormReset<RWAAssetDetailInputs>,
    ) => void;
    labels?: typeof defaultLabels;
    asset: RWAAssetDetail;
    assetTypeOptions: RWATableSelectProps<RWAAssetDetailInputs>['options'];
    maturityOptions: RWATableSelectProps<RWAAssetDetailInputs>['options'];
    hideNonEditableFields?: boolean;
}

export const RWAAssetDetails: React.FC<RWAAssetDetailsProps> = props => {
    const {
        asset,
        onEdit,
        onClose,
        onCancel,
        onSubmitForm,
        mode = 'view',
        operation = 'edit',
        assetTypeOptions,
        maturityOptions,
        labels = defaultLabels,
        hideNonEditableFields = false,
        ...restProps
    } = props;

    const { handleSubmit, control, reset } = useForm<RWAAssetDetailInputs>({
        defaultValues: {
            id: asset.id,
            isin: asset.isin,
            cuisp: asset.cusip,
            notional: asset.notional,
            assetName: asset.assetName,
            assetTypeId: asset.assetTypeId,
            maturityId: asset.maturityDate,
            purchaseTimestamp: asset.purchaseTimestamp,
            purchaseProceedsUSD: asset.purchaseProceeds,
        },
    });

    const isEditMode = mode === 'edit';
    const isCreateOperation = operation === 'create';

    const summaryRowStyles =
        'py-1 px-3 [&>div:first-child]:py-0 [&>div:last-child]:py-0';

    return (
        <div {...mergeClassNameProps(restProps, 'flex flex-col')}>
            <div className="flex h-12 items-center justify-between px-3">
                <div className="font-semibold">{labels.title}</div>
                <div>
                    {isEditMode ? (
                        <div className="flex gap-x-2">
                            <RWAButton
                                onClick={() => onCancel(reset)}
                                className="text-gray-600"
                            >
                                {labels.cancelEdits}
                            </RWAButton>
                            <RWAButton
                                onClick={handleSubmit(data =>
                                    onSubmitForm(data, reset),
                                )}
                                iconPosition="right"
                                icon={<Icon name="save" size={16} />}
                            >
                                {isCreateOperation
                                    ? labels.saveNewAsset
                                    : labels.saveEdits}
                            </RWAButton>
                            {isCreateOperation && onClose && (
                                <RWAButton
                                    onClick={onClose}
                                    iconPosition="right"
                                    icon={<Icon name="collapse" size={16} />}
                                />
                            )}
                        </div>
                    ) : (
                        <RWAButton
                            onClick={onEdit}
                            iconPosition="right"
                            icon={<Icon name="pencil" size={16} />}
                        >
                            {labels.editAsset}
                        </RWAButton>
                    )}
                </div>
            </div>
            <div>
                <RWAFormRow
                    label={labels.purchaseTimestamp}
                    hideLine={isEditMode}
                    value={
                        <RWATableDatePicker
                            control={control}
                            name="purchaseTimestamp"
                            disabled={!isEditMode}
                        />
                    }
                />
                <RWAFormRow
                    label={labels.assetType}
                    hideLine={isEditMode}
                    value={
                        <RWATableSelect
                            control={control}
                            name="assetTypeId"
                            disabled={!isEditMode}
                            options={assetTypeOptions}
                        />
                    }
                />
                <RWAFormRow
                    label={labels.maturityDate}
                    hideLine={isEditMode}
                    value={
                        <RWATableSelect
                            control={control}
                            name="maturityId"
                            disabled={!isEditMode}
                            options={maturityOptions}
                        />
                    }
                />
                <RWAFormRow
                    label={labels.cusip}
                    hideLine={isEditMode}
                    value={
                        <RWATableTextInput
                            control={control}
                            type="currency"
                            name="cuisp"
                            disabled={!isEditMode}
                        />
                    }
                />
                <RWAFormRow
                    label={labels.isin}
                    hideLine={isEditMode}
                    value={
                        <RWATableTextInput
                            control={control}
                            name="isin"
                            type="currency"
                            disabled={!isEditMode}
                        />
                    }
                />
                <RWAFormRow
                    label={labels.assetName}
                    hideLine={isEditMode}
                    value={
                        <RWATableTextInput
                            control={control}
                            name="assetName"
                            disabled={!isEditMode}
                        />
                    }
                />
                <RWAFormRow
                    label={labels.notional}
                    hideLine={isEditMode}
                    value={
                        <RWATableTextInput
                            control={control}
                            name="notional"
                            disabled={!isEditMode}
                        />
                    }
                />
                <RWAFormRow
                    label={labels.purchaseProceeds}
                    hideLine={isEditMode}
                    value={
                        <div className="flex flex-col items-end">
                            <div>
                                <RWATableTextInput
                                    control={control}
                                    name="purchaseProceedsUSD"
                                    type="currency"
                                    disabled={!isEditMode}
                                />
                            </div>
                            <div className="mt-[10px] flex">
                                <div className="mr-8 text-gray-600">
                                    {labels.unitPrice}
                                </div>
                                <div>{asset.unitPrice}</div>
                            </div>
                        </div>
                    }
                />
                {!hideNonEditableFields && (
                    <div className="bg-gray-100 pb-3">
                        <RWAFormRow
                            className={summaryRowStyles}
                            label={labels.totalDiscount}
                            value={asset.totalDiscount}
                        />
                        <RWAFormRow
                            className={summaryRowStyles}
                            label={labels.currentValue}
                            value={asset.currentValue}
                        />
                        <RWAFormRow
                            className={summaryRowStyles}
                            label={labels.realisedSurplus}
                            value={asset.realisedSurplus}
                        />
                        <RWAFormRow
                            className={summaryRowStyles}
                            label={labels.totalSurplus}
                            value={asset.totalSurplus}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
