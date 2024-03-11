import { ComponentPropsWithRef, Ref, forwardRef } from 'react';

export type DateTimeLocalInputProps = Omit<
    ComponentPropsWithRef<'input'>,
    'type'
>;

export const DateTimeLocalInput = forwardRef(function DateTimeLocalInput(
    props: DateTimeLocalInputProps,
    ref: Ref<HTMLInputElement>,
) {
    return (
        <input
            {...props}
            type="datetime-local"
            ref={ref}
            step={props.step ?? '1'}
        />
    );
});
