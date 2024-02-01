import { Control, Controller } from 'react-hook-form';
import { twMerge } from 'tailwind-merge';
import { RWASelect, RWASelectProps } from '../select';
import { RWATxDetailInputs, RWATxSelectTypes } from './form';

export interface RWATxSelectProps extends RWASelectProps {
    disabled?: boolean;
    name: RWATxSelectTypes;
    control: Control<RWATxDetailInputs>;
}

export const RWATxSelect: React.FC<RWATxSelectProps> = ({
    name,
    control,
    disabled = false,
    ...props
}) => (
    <Controller
        control={control}
        name={name}
        render={({ field: { onChange, onBlur, value } }) => (
            <RWASelect
                onBlur={onBlur}
                selectedKey={value}
                isDisabled={disabled}
                onSelectionChange={onChange}
                buttonProps={{
                    className: twMerge(
                        'h-[32px] rounded-md',
                        disabled && 'bg-white p-0 [&>span:last-child]:hidden ',
                    ),
                }}
                {...props}
            />
        )}
    />
);
