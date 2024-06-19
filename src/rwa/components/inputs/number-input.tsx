import { RWATableTextInput } from '@/rwa';
import { ComponentPropsWithRef } from 'react';
import {
    Control,
    Controller,
    ControllerProps,
    FieldValues,
    Path,
} from 'react-hook-form';
import { NumericFormat } from 'react-number-format';
import { twMerge } from 'tailwind-merge';

type Props<ControlInputs extends FieldValues> = ComponentPropsWithRef<
    typeof RWATableTextInput
> & {
    name: Path<ControlInputs>;
    control: Control<ControlInputs>;
    disabled?: boolean;
    currency?: 'USD';
    numericFormatProps?: ComponentPropsWithRef<typeof NumericFormat>;
    rules?: ControllerProps<ControlInputs>['rules'];
    errorMessage?: string;
    errorMessageClassName?: string;
};

export function RWANumberInput<ControlInputs extends FieldValues>(
    props: Props<ControlInputs>,
) {
    const {
        name,
        control,
        currency,
        rules,
        errorMessage,
        errorMessageClassName,
        numericFormatProps,
        value: _,
        onChange: __,
        ...inputProps
    } = props;

    const {
        allowNegative = false,
        decimalScale = 2,
        thousandSeparator = ',',
        fixedDecimalScale = true,
    } = numericFormatProps ?? {};

    const prefix = currency === 'USD' ? '$' : undefined;

    const invalid = props['aria-invalid'] === 'true';

    return (
        <Controller
            name={name}
            control={control}
            rules={rules}
            render={({ field: { onChange, value, ref } }) => (
                <>
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
                    {invalid && !!errorMessage && (
                        <p
                            role="alert"
                            className={twMerge(
                                'text-sm text-red-900',
                                errorMessageClassName,
                            )}
                        >
                            {errorMessage}
                        </p>
                    )}
                </>
            )}
        />
    );
}
