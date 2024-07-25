import { ComponentPropsWithRef, ForwardedRef, forwardRef } from 'react';
import { twJoin, twMerge } from 'tailwind-merge';

type InputProps = ComponentPropsWithRef<'input'>;
type FormInputProps = Omit<InputProps, 'className'> & {
    icon: React.JSX.Element;
    errorMessage?: string;
    isTouched?: boolean;
    isDirty?: boolean;
    type?: 'text' | 'password' | 'email' | 'url';
    inputClassName?: string;
    containerClassName?: string;
    errorMessageClassName?: string;
    hideErrors?: boolean;
};
export const FormInput = forwardRef(function FormInput(
    props: FormInputProps,
    ref: ForwardedRef<HTMLInputElement>,
) {
    const {
        icon,
        errorMessage,
        isDirty,
        containerClassName,
        inputClassName,
        errorMessageClassName,
        hideErrors = false,
        ...delegatedProps
    } = props;
    const type = props.type ?? 'text';
    const isError = !!errorMessage;
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
                    className={twJoin(
                        (!isDirty || isError) && 'text-slate-200',
                    )}
                >
                    {icon}
                </span>
                <input
                    {...delegatedProps}
                    type={type}
                    ref={ref}
                    className={twMerge(
                        'w-full bg-transparent font-semibold outline-none',
                        inputClassName,
                    )}
                />
            </div>
            <p
                className={twMerge(
                    'hidden min-h-4 text-xs text-red-900',
                    isError && 'block',
                    hideErrors && 'hidden',
                    errorMessageClassName,
                )}
            >
                {errorMessage}
            </p>
        </div>
    );
});
