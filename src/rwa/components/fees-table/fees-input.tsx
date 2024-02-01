import { twMerge } from 'tailwind-merge';
import { RWATextInput, RWATextInputProps } from '../text-input';

export interface RWAFeesTextInputProps extends RWATextInputProps {
    disabled?: boolean;
}

export const RWAFeesTextInput: React.FC<RWAFeesTextInputProps> = ({
    disabled = false,
    ...props
}) => (
    <RWATextInput
        textFieldProps={{ isDisabled: disabled }}
        inputProps={{ className: 'block w-full' }}
        className={twMerge('h-auto rounded-md bg-inherit p-3')}
        {...props}
    />
);
