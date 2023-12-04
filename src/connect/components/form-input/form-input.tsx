import {
    ComponentPropsWithRef,
    FocusEventHandler,
    FormEventHandler,
    ForwardedRef,
    forwardRef,
    useState,
} from 'react';
import { twJoin, twMerge } from 'tailwind-merge';
type InputProps = ComponentPropsWithRef<'input'>;
type FormInputProps = Omit<InputProps, 'className'> & {
    icon: React.JSX.Element;
    type?: 'text' | 'password' | 'email';
    inputClassName?: string;
    containerClassName?: string;
    customErrorMessages?: {
        patternMismatch?: React.ReactNode;
        tooLong?: React.ReactNode;
        tooShort?: React.ReactNode;
        typeMismatch?: React.ReactNode;
        valueMissing?: React.ReactNode;
    };
};
export const FormInput = forwardRef(function FormInput(
    props: FormInputProps,
    ref: ForwardedRef<HTMLInputElement>,
) {
    const [dirty, setDirty] = useState(props.value !== '');
    const [error, setError] = useState<React.ReactNode>('');
    const isError = error !== '';
    const type = props.type ?? 'text';

    const onBlur: FocusEventHandler<HTMLInputElement> = e => {
        const { validity, value } = e.currentTarget;
        const {
            patternMismatch,
            tooLong,
            tooShort,
            typeMismatch,
            valueMissing,
        } = validity;

        if (value !== '') {
            setDirty(true);
        }

        if (patternMismatch) {
            setError('Please match the requested format');
        } else if (tooLong) {
            setError(props.customErrorMessages?.tooLong ?? 'Too long');
        } else if (tooShort) {
            setError(props.customErrorMessages?.tooShort ?? 'Too short');
        } else if (typeMismatch) {
            setError(
                props.customErrorMessages?.typeMismatch ??
                    'Please enter a valid email address',
            );
        } else if (valueMissing) {
            setError(
                props.customErrorMessages?.valueMissing ?? 'Cannot be empty',
            );
        } else {
            setError('');
        }
        props.onBlur?.(e);
    };

    const onInput: FormEventHandler<HTMLInputElement> = e => {
        if (e.currentTarget.value !== '') {
            setError('');
        }
        props.onInput?.(e);
    };

    return (
        <div>
            <div
                className={twMerge(
                    'mb-1 flex gap-2 rounded-xl border border-transparent bg-[#F4F4F4] p-3 text-[#404446] placeholder:text-[#9EA0A1]',
                    isError && 'border-[#EA4335]',
                    props.containerClassName,
                )}
            >
                <span
                    className={twJoin((!dirty || isError) && 'text-[#6C7275]')}
                >
                    {props.icon}
                </span>
                <input
                    {...props}
                    type={type}
                    onBlur={onBlur}
                    onInput={onInput}
                    ref={ref}
                    className={twMerge(
                        'w-full bg-transparent font-semibold outline-none',
                        props.inputClassName,
                    )}
                />
            </div>
            <p
                className={twMerge(
                    'invisible min-h-[16px] text-xs text-[#EA4335]',
                    isError && 'visible',
                )}
            >
                {error}
            </p>
        </div>
    );
});
