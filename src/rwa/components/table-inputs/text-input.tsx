import { ComponentPropsWithRef, ForwardedRef, forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';

type Props = ComponentPropsWithRef<'input'> & {
    errorMessage?: string;
    labelClassName?: string;
    inputClassName?: string;
    errorMessageClassName?: string;
};

export const RWATableTextInput = forwardRef(function RWATableTextInput(
    props: Props,
    ref: ForwardedRef<HTMLInputElement>,
) {
    const invalid = props['aria-invalid'] === 'true';
    const {
        errorMessage,
        labelClassName,
        inputClassName,
        errorMessageClassName,
        ...inputProps
    } = props;

    return (
        <label className={labelClassName}>
            <input
                {...inputProps}
                ref={ref}
                className={twMerge(
                    'size-full h-8 rounded-md border border-transparent bg-gray-100 p-3 text-right text-sm text-gray-800 placeholder:text-gray-500 disabled:bg-white disabled:pr-0',
                    invalid &&
                        'border-red-900 outline-red-900 placeholder:text-red-800',
                    inputClassName,
                )}
            />
            {invalid && !!errorMessage && (
                <p
                    role="alert"
                    className={twMerge(
                        'text-sm text-red-900',
                        errorMessageClassName,
                    )}
                >
                    {errorMessage}
                </p>
            )}
        </label>
    );
});
