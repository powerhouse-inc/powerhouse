import { mergeClassNameProps } from '@/powerhouse/utils';
import React from 'react';
import {
    Input,
    InputProps,
    TextField,
    TextFieldProps,
} from 'react-aria-components';
import { twMerge } from 'tailwind-merge';

export interface TextInputProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
    inputProps?: InputProps;
    endAdornment?: React.ReactNode;
    value?: TextFieldProps['value'];
    textFieldProps?: TextFieldProps;
    startAdornment?: React.ReactNode;
    onChange?: TextFieldProps['onChange'];
}

export const TextInput: React.FC<TextInputProps> = props => {
    const {
        value,
        onChange,
        className,
        endAdornment,
        startAdornment,
        inputProps = {},
        textFieldProps = {},
        ...containerProps
    } = props;

    return (
        <div
            className={twMerge('flex flex-row', className)}
            {...containerProps}
        >
            {startAdornment}
            <TextField
                value={value}
                onChange={onChange}
                {...mergeClassNameProps(textFieldProps, 'flex flex-1 min-w-0')}
            >
                <Input
                    {...mergeClassNameProps(
                        inputProps,
                        'flex flex-1 outline-none bg-inherit min-w-0',
                    )}
                />
            </TextField>
            {endAdornment}
        </div>
    );
};
