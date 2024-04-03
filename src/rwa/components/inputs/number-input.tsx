import { RWATableTextInput } from '@/rwa';
import { ComponentPropsWithRef } from 'react';
import { Control, Controller, FieldValues, Path } from 'react-hook-form';
import { NumericFormat } from 'react-number-format';

type Props<ControlInputs extends FieldValues> = ComponentPropsWithRef<
    typeof RWATableTextInput
> & {
    name: Path<ControlInputs>;
    control: Control<ControlInputs>;
    disabled?: boolean;
    requiredErrorMessage?: string;
    currency?: 'USD';
    numericFormatProps?: ComponentPropsWithRef<typeof NumericFormat>;
};

export function RWANumberInput<ControlInputs extends FieldValues>(
    props: Props<ControlInputs>,
) {
    const {
        name,
        control,
        requiredErrorMessage,
        currency,
        value: _,
        onChange: __,
        numericFormatProps,
        ...inputProps
    } = props;

    const {
        allowNegative = true,
        decimalScale = 2,
        thousandSeparator = ',',
        fixedDecimalScale = true,
    } = numericFormatProps ?? {};

    const prefix = currency === 'USD' ? '$' : undefined;

    return (
        <Controller
            name={name}
            control={control}
            rules={{ required: requiredErrorMessage ?? props.required }}
            render={({ field: { onChange, value, ref } }) => (
                <NumericFormat
                    {...inputProps}
                    getInputRef={ref}
                    prefix={prefix}
                    allowNegative={allowNegative}
                    decimalScale={decimalScale}
                    onValueChange={({ floatValue }) => onChange(floatValue)}
                    value={value}
                    customInput={RWATableTextInput}
                    thousandSeparator={thousandSeparator}
                    fixedDecimalScale={fixedDecimalScale}
                />
            )}
        />
    );
}
