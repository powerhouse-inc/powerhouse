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
            <div className="peer h-6 w-11 rounded-full bg-grey-500 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-none after:bg-grey-50 after:transition-all peer-checked:bg-blue-900 peer-checked:after:translate-x-full peer-focus:outline-none" />
        </label>
    );
});
