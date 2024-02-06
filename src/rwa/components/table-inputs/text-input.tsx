import { useNumberFormat } from '@react-input/number-format';
import { Control, Controller, FieldValues, Path } from 'react-hook-form';
import { twMerge } from 'tailwind-merge';
import { RWATextInput, RWATextInputProps } from '../text-input';

export interface RWATableTextInputProps<ControlInputs extends FieldValues>
    extends RWATextInputProps {
    disabled?: boolean;
    name: Path<ControlInputs>;
    control: Control<ControlInputs>;
    type?: React.HTMLInputTypeAttribute | 'currency';
}

export function RWATableTextInput<ControlInputs extends FieldValues>(
    props: RWATableTextInputProps<ControlInputs>,
) {
    const {
        name,
        control,
        type = 'text',
        disabled = false,
        ...restProps
    } = props;

    const inputProps: RWATextInputProps['inputProps'] = { type };

    const currencyInputRef = useNumberFormat({
        locales: 'en',
        format: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
    });

    if (type === 'currency') {
        inputProps.ref = currencyInputRef;
    }

    return (
        <Controller
            name={name}
            control={control}
            render={({ field: { onChange, onBlur, value } }) => (
                <RWATextInput
                    value={value}
                    onBlur={onBlur}
                    onChange={onChange}
                    textFieldProps={{ isDisabled: disabled }}
                    inputProps={{
                        className: 'text-right',
                        ...inputProps,
                    }}
                    className={twMerge(
                        'h-[32px] rounded-md',
                        disabled && 'bg-white p-0',
                    )}
                    {...restProps}
                />
            )}
        />
    );
}
