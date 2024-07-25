import { useLayoutEffect, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { useEventListener, useOnClickOutside } from 'usehooks-ts';

type Props = {
    name?: string;
    defaultValue?: string;
    placeholder?: string;
    'aria-label'?: string;
    className?: string;
    minLength?: number;
    onSubmit: (value: string) => void;
    onCancel: () => void;
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
            required
            autoFocus
            type="text"
            ref={ref}
            value={value}
            minLength={minLength}
            className={twMerge(
                'bg-inherit text-inherit outline-none',
                className,
            )}
            onChange={e => setValue(e.target.value)}
        />
    );
}
