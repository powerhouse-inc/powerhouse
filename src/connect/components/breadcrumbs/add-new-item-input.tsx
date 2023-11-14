import React, { useLayoutEffect, useRef, useState } from 'react';
import { useKeyboard } from 'react-aria';
import { Button, Input, PressEvent, TextField } from 'react-aria-components';
import ClickAwayListener from 'react-click-away-listener';
import { twMerge } from 'tailwind-merge';

export interface AddNewItemInputProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSubmit'> {
    onCancel: () => void;
    onSubmit: (value: string, event?: PressEvent) => void;
    'aria-label'?: string;
}

export const AddNewItemInput: React.FC<AddNewItemInputProps> = props => {
    const {
        onSubmit,
        onCancel,
        className,
        style,
        placeholder,
        'aria-label': ariaLabel,
        defaultValue = '',
        ...containerProps
    } = props;

    const [text, setText] = useState(defaultValue.toString());
    const inputRef = useRef<HTMLInputElement>(null);

    useLayoutEffect(() => {
        setTimeout(() => {
            inputRef.current?.focus();
        }, 500);
    }, []);

    const { keyboardProps } = useKeyboard({
        onKeyUp(e) {
            if (e.key === 'Enter') {
                onSubmit(text);
            }
            if (e.key === 'Escape') {
                onCancel?.();
            }
        },
    });

    return (
        <ClickAwayListener onClickAway={() => onSubmit(text)}>
            <div
                className={twMerge(
                    'flex items-center text-[#404446]',
                    className,
                )}
                style={{
                    ...style,
                }}
                {...keyboardProps}
                {...containerProps}
            >
                <TextField
                    value={text}
                    onChange={setText}
                    aria-label={ariaLabel}
                    autoFocus
                >
                    <Input
                        className="outline-none bg-inherit"
                        placeholder={placeholder}
                        ref={inputRef}
                    />
                </TextField>
                <div className="flex items-center gap-1">
                    <Button onPress={e => onSubmit(text, e)}>
                        <svg
                            className="w-6 h-6"
                            viewBox="0 0 24 24"
                            fill="currentcolor"
                        >
                            <path
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M16.9993 8.51506L15.4844 7L11.9994 10.4852L8.51497 7.00057L7 8.51562L10.4844 12.0003L7.00056 15.4843L8.51552 16.9994L11.9994 13.5153L15.4838 17L16.9988 15.4849L13.5144 12.0003L16.9993 8.51506Z"
                            />
                        </svg>
                    </Button>
                    <Button onPress={onCancel}>
                        <svg
                            className="w-6 h-6"
                            viewBox="0 0 24 25"
                            fill="currentcolor"
                        >
                            <path d="M10.1575 17.0119C10.5032 17.0119 10.8257 16.8736 11.0562 16.6432L18.3142 9.38513L16.517 7.58789L10.1575 13.9473L7.48473 11.2745L5.6875 13.0718L9.25893 16.6432C9.48934 16.8736 9.81192 17.0119 10.1575 17.0119Z" />
                        </svg>
                    </Button>
                </div>
            </div>
        </ClickAwayListener>
    );
};
