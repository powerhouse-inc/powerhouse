import { useLayoutEffect, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { useEventListener, useOnClickOutside } from 'usehooks-ts';

type Props = {
    readonly name?: string;
    readonly defaultValue?: string;
    readonly placeholder?: string;
    readonly 'aria-label'?: string;
    readonly className?: string;
    readonly minLength?: number;
    readonly onSubmit: (value: string) => void;
    readonly onCancel: () => void;
};
export function NodeInput(props: Props) {
    const {
        onSubmit,
        onCancel,
        defaultValue,
        className,
        minLength = 1,
        ...inputProps
    } = props;
    const [value, setValue] = useState(defaultValue ?? '');

    const ref = useRef<HTMLInputElement>(null);

    useOnClickOutside(ref, handleSubmit);

    useEventListener('keyup', e => {
        if (e.key === 'Enter') {
            handleSubmit();
        }
        if (e.key === 'Escape') {
            onCancel();
        }
    });

    useLayoutEffect(() => {
        setTimeout(() => {
            ref.current?.focus();
            ref.current?.select();
            ref.current?.scroll({ left: 9999 });
        }, 100);
    }, []);

    function handleSubmit() {
        if (value.length >= minLength) {
            onSubmit(value);
        }
    }

    return (
        <input
            {...inputProps}
            autoFocus
            className={twMerge(
                'bg-inherit text-inherit outline-none',
                className,
            )}
            minLength={minLength}
            onChange={e => setValue(e.target.value)}
            ref={ref}
            required
            type="text"
            value={value}
        />
    );
}
