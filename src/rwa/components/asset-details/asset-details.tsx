import { DivProps, Icon, mergeClassNameProps } from '@/powerhouse';
import { parseDate } from '@internationalized/date';
import React from 'react';
import { SubmitHandler, UseFormReset, useForm } from 'react-hook-form';
import {
    FixedIncomeAsset,
    FixedIncomeType,
    RWAComponentMode,
    SPV,
} from '../../types';
import { RWAButton } from '../button';
import {
    RWAFormRow,
    RWATableDatePicker,
    RWATableSelect,
    RWATableTextInput,
} from '../table-inputs';
import { RWAAssetDetailInputs } from './form';

const defaultLabels = {
    title: 'Asset Details',
    editAsset: 'Edit Asset',
    saveNewAsset: 'Save New Asset',
    saveEdits: 'Save Edits',
    cancelEdits: 'Cancel',
    fixedIncomeType: 'Asset Type',
    spv: 'SPV',
    maturity: 'Maturity Date',
    name: 'Asset Name',
    CUSIP: 'CUSIP',
    ISIN: 'ISIN',
    coupon: 'Coupon',
    notional: 'Notional',
    purchaseDate: 'Purchase Date',
    purchasePrice: 'Purchase Price',
    purchaseProceeds: 'Purchase Proceeds',
    totalDiscount: 'Total Discount',
    annualizedYield: 'Annualized Yield',
};

export interface RWAAssetDetailsProps extends DivProps {
    asset: FixedIncomeAsset;
    operation?: 'create' | 'edit';
    mode?: RWAComponentMode;
    fixedIncomeTypes: FixedIncomeType[];
    spvs: SPV[];
    onClose?: () => void;
    onCancel: (reset: UseFormReset<RWAAssetDetailInputs>) => void;
    selectItemToEdit?: () => void;
    onSubmitForm: (data: RWAAssetDetailInputs) => void;
    labels?: typeof defaultLabels;
    hideNonEditableFields?: boolean;
}

export const RWAAssetDetails: React.FC<RWAAssetDetailsProps> = props => {
    const {
        asset,
        fixedIncomeTypes,
        spvs,
        selectItemToEdit,
        onClose,
        onCancel,
        onSubmitForm,
        mode = 'view',
        operation = 'edit',
        labels = defaultLabels,
        ...restProps
    } = props;

    const fixedIncomeType = fixedIncomeTypes.find(
        ({ id }) => id === asset.fixedIncomeTypeId,
    );
    const spv = spvs.find(({ id }) => id === asset.spvId);

    const { handleSubmit, control, reset } = useForm<RWAAssetDetailInputs>({
        defaultValues: {
            fixedIncomeTypeId: fixedIncomeType?.id ?? fixedIncomeTypes[0].id,
            spvId: spv?.id ?? spvs[0].id,
            name: asset.name,
            maturity: parseDate(asset.maturity.split('T')[0]),
            ISIN: asset.ISIN,
            CUSIP: asset.CUSIP,
            coupon: asset.coupon,
        },
    });

    const onSubmit: SubmitHandler<RWAAssetDetailInputs> = data => {
        onSubmitForm(data);
    };

    const isEditMode = mode === 'edit';
    const isCreateOperation = operation === 'create';

    return (
        <div {...mergeClassNameProps(restProps, 'flex flex-col bg-white')}>
            <div className="mt-4 flex h-12 items-center justify-between px-3">
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
                                onClick={handleSubmit(onSubmit)}
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
                            onClick={selectItemToEdit}
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
                    label="Asset ID"
                    hideLine={isEditMode}
                    value={asset.id}
                />
                <RWAFormRow
                    label={labels.name}
                    hideLine={isEditMode}
                    value={
                        <RWATableTextInput
                            control={control}
                            name="name"
                            disabled={!isEditMode}
                        />
                    }
                />
                <RWAFormRow
                    label={labels.CUSIP}
                    hideLine={isEditMode}
                    value={
                        <RWATableTextInput
                            control={control}
                            name="CUSIP"
                            disabled={!isEditMode}
                        />
                    }
                />
                <RWAFormRow
                    label={labels.ISIN}
                    hideLine={isEditMode}
                    value={
                        <RWATableTextInput
                            control={control}
                            name="ISIN"
                            disabled={!isEditMode}
                        />
                    }
                />
                <RWAFormRow
                    label={labels.maturity}
                    hideLine={isEditMode}
                    value={
                        <RWATableDatePicker
                            control={control}
                            name="maturity"
                            disabled={!isEditMode}
                        />
                    }
                />
                <RWAFormRow
                    label={labels.fixedIncomeType}
                    hideLine={isEditMode}
                    value={
                        <RWATableSelect
                            control={control}
                            name="fixedIncomeTypeId"
                            disabled={!isEditMode}
                            options={fixedIncomeTypes.map(t => ({
                                ...t,
                                label: t.name,
                            }))}
                        />
                    }
                />
                <RWAFormRow
                    label={labels.spv}
                    hideLine={isEditMode}
                    value={
                        <RWATableSelect
                            control={control}
                            name="spvId"
                            disabled={!isEditMode}
                            options={spvs.map(t => ({
                                ...t,
                                label: t.name,
                            }))}
                        />
                    }
                />
                {!isCreateOperation && (
                    <>
                        <RWAFormRow
                            label={labels.notional}
                            hideLine={isEditMode}
                            value={asset.notional}
                        />
                        <RWAFormRow
                            label={labels.purchaseDate}
                            hideLine={isEditMode}
                            value={asset.purchaseDate}
                        />
                        <RWAFormRow
                            label={labels.purchasePrice}
                            hideLine={isEditMode}
                            value={asset.purchasePrice}
                        />
                        <RWAFormRow
                            label={labels.purchaseProceeds}
                            hideLine={isEditMode}
                            value={asset.purchaseProceeds}
                        />
                    </>
                )}
            </div>
        </div>
    );
};
