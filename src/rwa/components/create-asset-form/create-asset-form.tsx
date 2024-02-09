import { FixedIncomeType, SPV } from '@/rwa';
import { parseDate } from '@internationalized/date';
import React from 'react';
import { Control, Controller, SubmitHandler } from 'react-hook-form';
import { RWADatePicker } from '../date-picker';
import { RWASelect } from '../select';
import { RWATextInput } from '../text-input';

export type RWACreateAssetInputs = {
    name: string;
    fixedIncomeTypeId: string;
    spvId: string;
    maturity: string;
    ISIN?: string;
    CUSIP?: string;
    coupon?: number;
};

export type RWACreateAssetFormSubmitHandler =
    SubmitHandler<RWACreateAssetInputs>;

export interface RWACreateAssetFormProps {
    control: Control<RWACreateAssetInputs>;
    fixedIncomeTypes: FixedIncomeType[];
    spvs: SPV[];
    labels: Record<string, string>;
}

export const RWACreateAssetForm: React.FC<RWACreateAssetFormProps> = props => {
    const { labels, control, fixedIncomeTypes, spvs } = props;

    const fixedIncomeTypeOptions = fixedIncomeTypes.map(type => ({
        id: type.id,
        label: type.name,
    }));

    const spvOptions = spvs.map(spv => ({ id: spv.id, label: spv.name }));

    return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div>
                <Controller
                    control={control}
                    name="fixedIncomeTypeId"
                    render={({ field: { onChange, value, onBlur } }) => (
                        <RWASelect
                            onBlur={onBlur}
                            selectedKey={value}
                            onSelectionChange={onChange}
                            label={labels.fixedIncomeTypeId}
                            buttonProps={{ className: 'w-full' }}
                            options={fixedIncomeTypeOptions}
                        />
                    )}
                />
            </div>
            <div>
                <Controller
                    control={control}
                    name="spvId"
                    render={({ field: { onChange, value, onBlur } }) => (
                        <RWASelect
                            onBlur={onBlur}
                            selectedKey={value}
                            onSelectionChange={onChange}
                            label={labels.spvId}
                            buttonProps={{ className: 'w-full' }}
                            options={spvOptions}
                        />
                    )}
                />
            </div>
            <div />
            <div>
                <Controller
                    control={control}
                    name="name"
                    render={({ field: { onChange, value, onBlur } }) => (
                        <RWATextInput
                            value={value}
                            onBlur={onBlur}
                            onChange={onChange}
                            label={labels.name}
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
                            value={parseDate(value.split('T')[0])}
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
                    name="CUSIP"
                    render={({ field: { onChange, value, onBlur } }) => (
                        <RWATextInput
                            value={value}
                            onBlur={onBlur}
                            onChange={onChange}
                            label={labels.CUSIP}
                            inputProps={{ placeholder: '-' }}
                        />
                    )}
                />
            </div>
            <div>
                <Controller
                    control={control}
                    name="ISIN"
                    render={({ field: { onChange, value, onBlur } }) => (
                        <RWATextInput
                            value={value}
                            onBlur={onBlur}
                            onChange={onChange}
                            label={labels.ISIN}
                            inputProps={{ placeholder: '-' }}
                        />
                    )}
                />
            </div>
            <div>
                <Controller
                    control={control}
                    name="coupon"
                    render={({ field: { onChange, value, onBlur } }) => (
                        <RWATextInput
                            value={value?.toString() ?? ''}
                            onBlur={onBlur}
                            onChange={onChange}
                            label={labels.coupon}
                            inputProps={{ placeholder: '-' }}
                        />
                    )}
                />
            </div>
        </div>
    );
};
