import { CalendarDate } from '@internationalized/date';
import React from 'react';
import { Control, Controller, SubmitHandler } from 'react-hook-form';
import { RWADatePicker } from '../date-picker';
import { RWASelect } from '../select';
import { RWATextInput } from '../text-input';

export type RWACreateAssetInputs = {
    assetType: string;
    assetName: string;
    maturity: CalendarDate;
    cusip: string;
    notional: string;
    purchaseProceeds: string;
    totalDiscount: string;
    currentValue: string;
    realisedSurplus: string;
    totalSurplus: string;
};

export type RWACreateAssetFormSubmitHandler =
    SubmitHandler<RWACreateAssetInputs>;

export interface RWACreateAssetFormProps {
    control: Control<RWACreateAssetInputs>;
    labels?: {
        assetType?: string;
        assetName?: string;
        maturity?: string;
        cusip?: string;
        notional?: string;
        purchaseProceeds?: string;
        totalDiscount?: string;
        currentValue?: string;
        realisedSurplus?: string;
        totalSurplus?: string;
    };
}

export const RWACreateAssetForm: React.FC<RWACreateAssetFormProps> = props => {
    const { labels = {}, control } = props;

    return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div>
                <Controller
                    control={control}
                    name="assetType"
                    render={({ field: { onChange, value, onBlur } }) => (
                        <RWASelect
                            onBlur={onBlur}
                            selectedKey={value}
                            onSelectionChange={onChange}
                            label={labels.assetType || 'Asset Type'}
                            buttonProps={{ className: 'w-full' }}
                            options={[
                                { id: '1', label: 'Asset type 1' },
                                { id: '2', label: 'Asset type 2' },
                            ]}
                        />
                    )}
                />
            </div>
            <div />
            <div>
                <Controller
                    control={control}
                    name="assetName"
                    render={({ field: { onChange, value, onBlur } }) => (
                        <RWATextInput
                            value={value}
                            onBlur={onBlur}
                            onChange={onChange}
                            label={labels.assetName || 'Asset Name'}
                            inputProps={{ placeholder: '-' }}
                        />
                    )}
                />
            </div>
            <div>
                <Controller
                    control={control}
                    name="maturity"
                    render={({ field: { onChange, value, onBlur } }) => (
                        <RWADatePicker
                            value={value}
                            onBlur={onBlur}
                            onChange={onChange}
                            label={labels.maturity || 'Maturity'}
                        />
                    )}
                />
            </div>
            <div>
                <Controller
                    control={control}
                    name="cusip"
                    render={({ field: { onChange, value, onBlur } }) => (
                        <RWATextInput
                            value={value}
                            onBlur={onBlur}
                            onChange={onChange}
                            label={labels.cusip || 'CUSIP'}
                            inputProps={{ placeholder: '-' }}
                        />
                    )}
                />
            </div>
            <div />
            <div>
                <Controller
                    control={control}
                    name="notional"
                    render={({ field: { onChange, value, onBlur } }) => (
                        <RWATextInput
                            value={value}
                            onBlur={onBlur}
                            onChange={onChange}
                            label={labels.notional || 'Notional'}
                            inputProps={{ placeholder: '-' }}
                        />
                    )}
                />
            </div>
            <div>
                <Controller
                    control={control}
                    name="purchaseProceeds"
                    render={({ field: { onChange, value, onBlur } }) => (
                        <RWATextInput
                            value={value}
                            onBlur={onBlur}
                            onChange={onChange}
                            label={
                                labels.purchaseProceeds ||
                                'Purchase Proceeds $USD'
                            }
                            inputProps={{ placeholder: '-' }}
                        />
                    )}
                />
            </div>
            <div>
                <Controller
                    control={control}
                    name="totalDiscount"
                    render={({ field: { onChange, value, onBlur } }) => (
                        <RWATextInput
                            value={value}
                            onBlur={onBlur}
                            onChange={onChange}
                            label={
                                labels.totalDiscount || 'Total Discount $USD'
                            }
                            inputProps={{ placeholder: '-' }}
                        />
                    )}
                />
            </div>
            <div>
                <Controller
                    control={control}
                    name="currentValue"
                    render={({ field: { onChange, value, onBlur } }) => (
                        <RWATextInput
                            value={value}
                            onBlur={onBlur}
                            onChange={onChange}
                            label={labels.currentValue || 'Current Value $USD'}
                            inputProps={{ placeholder: '-' }}
                        />
                    )}
                />
            </div>
            <div>
                <Controller
                    control={control}
                    name="realisedSurplus"
                    render={({ field: { onChange, value, onBlur } }) => (
                        <RWATextInput
                            value={value}
                            onBlur={onBlur}
                            onChange={onChange}
                            label={
                                labels.realisedSurplus ||
                                'Realised Surplus $USD'
                            }
                            inputProps={{ placeholder: '-' }}
                        />
                    )}
                />
            </div>
            <div>
                <Controller
                    control={control}
                    name="totalSurplus"
                    render={({ field: { onChange, value, onBlur } }) => (
                        <RWATextInput
                            value={value}
                            onBlur={onBlur}
                            onChange={onChange}
                            label={labels.totalSurplus || 'Total Surplus $USD'}
                            inputProps={{ placeholder: '-' }}
                        />
                    )}
                />
            </div>
        </div>
    );
};
