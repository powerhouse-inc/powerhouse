import { Combobox } from '@/connect/components/combobox';
import { ComponentPropsWithoutRef } from 'react';
import { Control, Controller, FieldValues, Path } from 'react-hook-form';

export type RWATableSelectProps<ControlInputs extends FieldValues> = Omit<
    ComponentPropsWithoutRef<typeof Combobox>,
    'options'
> & {
    options: { label: string; value: string }[];
    disabled?: boolean;
    name: Path<ControlInputs>;
    control: Control<ControlInputs>;
    required?: boolean;
};

export function RWATableSelect<ControlInputs extends FieldValues>(
    props: RWATableSelectProps<ControlInputs>,
) {
    const {
        options,
        name,
        control,
        required = false,
        disabled = false,
        ...restProps
    } = props;

    return (
        <Controller
            name={name}
            control={control}
            rules={{ required }}
            render={({ field: { onChange, onBlur, value } }) =>
                disabled ? (
                    <>{options.find(option => option.value === value)?.label}</>
                ) : (
                    <Combobox
                        options={options}
                        onBlur={onBlur}
                        value={options.find(option => option.value === value)}
                        isDisabled={disabled}
                        onChange={option =>
                            !!option &&
                            typeof option === 'object' &&
                            'value' in option &&
                            onChange(option.value)
                        }
                        {...restProps}
                    />
                )
            }
        />
    );
}
