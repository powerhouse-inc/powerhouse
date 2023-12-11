import {
    ChangeEventHandler,
    ComponentPropsWithRef,
    FocusEventHandler,
    ForwardedRef,
    forwardRef,
    useCallback,
    useEffect,
    useState,
} from 'react';
import { twJoin, twMerge } from 'tailwind-merge';
type InputProps = ComponentPropsWithRef<'input'>;
type FormInputProps = Omit<InputProps, 'className'> & {
    icon: React.JSX.Element;
    type?: 'text' | 'password' | 'email' | 'url';
    inputClassName?: string;
    containerClassName?: string;
    customErrorMessages?: {
        patternMismatch?: React.ReactNode;
        tooLong?: React.ReactNode;
        tooShort?: React.ReactNode;
        typeMismatch?: React.ReactNode;
        valueMissing?: React.ReactNode;
    };
    errorOverride?: React.ReactNode;
    onError?: (error?: React.ReactNode) => void;
};
export const FormInput = forwardRef(function FormInput(
    props: FormInputProps,
    ref: ForwardedRef<HTMLInputElement>,
) {
    const {
        icon,
        containerClassName,
        inputClassName,
        errorOverride,
        onError,
        ...delegatedProps
    } = props;

    const [dirty, setDirty] = useState(props.value !== '');
    const [error, setError] = useState<React.ReactNode>(errorOverride ?? '');
    const isError = error !== '';
    const type = props.type ?? 'text';

    const onErrorCallback = useCallback(
        (error: React.ReactNode) => onError?.(error),
        [onError],
    );

    useEffect(() => {
        if (errorOverride) {
            setError(errorOverride);
        }
    }, [errorOverride]);

    useEffect(() => {
        if (isError) {
            onErrorCallback(error);
        }
    }, [error, isError, onErrorCallback]);

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

    const onChange: ChangeEventHandler<HTMLInputElement> = e => {
        if (e.currentTarget.value !== '') {
            setError('');
        }
        props.onChange?.(e);
    };

    return (
        <div>
            <div
                className={twMerge(
                    'mb-1 flex gap-2 rounded-xl border border-transparent bg-gray-100 p-3 text-gray-800 placeholder:text-gray-500',
                    isError && 'border-red-900',
                    containerClassName,
                )}
            >
                <span
                    className={twJoin((!dirty || isError) && 'text-slate-200')}
                >
                    {icon}
                </span>
                <input
                    {...delegatedProps}
                    type={type}
                    onBlur={onBlur}
                    onChange={onChange}
                    ref={ref}
                    className={twMerge(
                        'w-full bg-transparent font-semibold outline-none',
                        inputClassName,
                    )}
                />
            </div>
            <p
                className={twMerge(
                    'invisible min-h-[16px] text-xs text-red-900',
                    isError && 'visible',
                )}
            >
                {error}
            </p>
        </div>
    );
});
