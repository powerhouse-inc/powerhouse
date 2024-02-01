import { Control, Controller } from 'react-hook-form';
import { twMerge } from 'tailwind-merge';
import { RWATextInput, RWATextInputProps } from '../text-input';
import { RWATxDetailInputs, RWATxTextTypes } from './form';

export interface RWATxTextInputProps extends RWATextInputProps {
    disabled?: boolean;
    name: RWATxTextTypes;
    control: Control<RWATxDetailInputs>;
}

export const RWATxTextInput: React.FC<RWATxTextInputProps> = ({
    name,
    control,
    disabled = false,
    ...props
}) => (
    <Controller
        name={name}
        control={control}
        render={({ field: { onChange, onBlur, value } }) => (
            <RWATextInput
                value={value}
                onBlur={onBlur}
                onChange={onChange}
                textFieldProps={{ isDisabled: disabled }}
                inputProps={{ className: 'text-right' }}
                className={twMerge(
                    'h-[32px] rounded-md',
                    disabled && 'bg-white p-0',
                )}
                {...props}
            />
        )}
    />
);
