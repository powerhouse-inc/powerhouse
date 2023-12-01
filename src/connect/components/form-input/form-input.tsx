import { ComponentPropsWithRef, ForwardedRef, forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';

type FormInputProps = Omit<ComponentPropsWithRef<'input'>, 'className'> & {
    icon: React.JSX.Element;
    inputClassName?: string;
    containerClassName?: string;
};
export const FormInput = forwardRef(function FormInput(
    props: FormInputProps,
    ref: ForwardedRef<HTMLInputElement>,
) {
    return (
        <div
            className={twMerge(
                'flex gap-2 rounded-xl bg-[#F4F4F4] p-3 text-[#9EA0A1] placeholder:text-[#9EA0A1]',
                props.containerClassName,
            )}
        >
            <span>{props.icon}</span>
            <input
                {...props}
                ref={ref}
                className={twMerge(
                    'w-full bg-transparent font-semibold outline-none ',
                    props.inputClassName,
                )}
            />
        </div>
    );
});
