import { mergeClassNameProps } from '@/powerhouse';
import {
    Input,
    InputProps,
    TextField,
    TextFieldProps,
} from 'react-aria-components';
import { twMerge } from 'tailwind-merge';

export interface TextInputProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
    inputProps?: InputProps & React.RefAttributes<HTMLInputElement>;
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
                {...mergeClassNameProps(textFieldProps, 'flex min-w-0 flex-1')}
            >
                <Input
                    {...mergeClassNameProps(
                        inputProps,
                        'flex min-w-0 flex-1 bg-inherit outline-none',
                    )}
                />
            </TextField>
            {endAdornment}
        </div>
    );
};
