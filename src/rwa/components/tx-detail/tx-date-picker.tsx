import { Icon } from '@/powerhouse';
import { Control, Controller } from 'react-hook-form';
import { twMerge } from 'tailwind-merge';
import { RWADatePicker, RWADatePickerProps } from '../date-picker';
import { RWATxDateTypes, RWATxDetailInputs } from './form';

export interface RWATxDatePickerProps extends RWADatePickerProps {
    disabled?: boolean;
    control: Control<RWATxDetailInputs>;
    name: RWATxDateTypes;
}

export const RWATxDatePicker: React.FC<RWATxDatePickerProps> = ({
    name,
    control,
    disabled = false,
    ...props
}) => (
    <Controller
        name={name}
        control={control}
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
                {...props}
            />
        )}
    />
);
