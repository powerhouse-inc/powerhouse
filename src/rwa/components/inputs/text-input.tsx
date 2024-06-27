import { ComponentPropsWithRef, ForwardedRef, forwardRef, memo } from 'react';
import { twMerge } from 'tailwind-merge';

type Props = Omit<ComponentPropsWithRef<'input'>, 'type'> & {
    defaultValue?: string | number | null | undefined;
    errorMessage?: string;
    labelClassName?: string;
    inputClassName?: string;
    errorMessageClassName?: string;
};

export const _RWATableTextInput = forwardRef(function RWATableTextInput(
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
                type="text"
                ref={ref}
                className={twMerge(
                    'h-8 w-full rounded-md border border-transparent bg-gray-100 p-3 text-right placeholder:text-gray-500 disabled:bg-transparent disabled:p-0 disabled:text-left',
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

export const RWATableTextInput = memo(_RWATableTextInput);
