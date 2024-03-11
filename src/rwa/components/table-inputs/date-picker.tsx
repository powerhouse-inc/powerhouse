import { Icon } from '@/powerhouse';
import { Control, Controller, FieldValues, Path } from 'react-hook-form';
import { twMerge } from 'tailwind-merge';
import { RWADatePicker, RWADatePickerProps } from '../date-picker';

export interface RWATableDatePickerProps<ControlInputs extends FieldValues>
    extends RWADatePickerProps {
    disabled?: boolean;
    control: Control<ControlInputs>;
    name: Path<ControlInputs>;
    required?: boolean;
}

export function RWATableDatePicker<ControlInputs extends FieldValues>(
    props: RWATableDatePickerProps<ControlInputs>,
) {
    const {
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
            render={({ field: { onChange, onBlur, value } }) => (
                <RWADatePicker
                    value={value}
                    onBlur={onBlur}
                    leftIcon={null}
                    onChange={onChange}
                    isDisabled={disabled}
                    groupProps={{
                        className: twMerge(
                            'h-[32px] rounded-md',
                            disabled && 'bg-white px-0',
                        ),
                    }}
                    rightIcon={
                        disabled ? null : (
                            <Icon name="calendar" size={16} className="ml-2" />
                        )
                    }
                    {...restProps}
                />
            )}
        />
    );
}
