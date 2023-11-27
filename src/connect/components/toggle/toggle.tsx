import { ComponentPropsWithRef, ForwardedRef, forwardRef } from 'react';

type ToggleProps = Omit<ComponentPropsWithRef<'input'>, 'type'>;

export const Toggle = forwardRef(function Toggle(
    props: ToggleProps,
    ref: ForwardedRef<HTMLInputElement>,
) {
    return (
        <label
            htmlFor={props.id}
            className="relative cursor-pointer items-center"
        >
            <input
                ref={ref}
                type="checkbox"
                value=""
                className="peer sr-only"
                {...props}
            />
            <div className="peer h-6 w-11 rounded-full bg-[#9EA0A1] after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-none after:bg-[#FCFCFC] after:transition-all peer-checked:bg-[#0084FF] peer-checked:after:translate-x-full peer-focus:outline-none" />
        </label>
    );
});
