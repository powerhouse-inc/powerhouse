import CheckIcon from '@/assets/icons/check-fill.svg';
import CancelIcon from '@/assets/icons/xmark.svg';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { useKeyboard } from 'react-aria';
import { Button, Input, PressEvent, TextField } from 'react-aria-components';
import ClickAwayListener from 'react-click-away-listener';
import { twMerge } from 'tailwind-merge';

export interface AddNewItemInputProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSubmit'> {
    initialValue: string;
    placeholder: string;
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
        initialValue = '',
        ...containerProps
    } = props;

    const [text, setText] = useState(initialValue);
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
                    'flex flex-row items-center pr-5',
                    className,
                )}
                style={{
                    ...style,
                }}
                {...keyboardProps}
                {...containerProps}
            >
                <TextField
                    className="flex flex-1 ml-2 min-w-0"
                    value={text}
                    onChange={setText}
                    aria-label={ariaLabel}
                    autoFocus
                >
                    <Input
                        className="flex flex-1 outline-none bg-inherit min-w-0"
                        placeholder={placeholder}
                        ref={inputRef}
                    />
                </TextField>
                <div className="flex flex-row items-center">
                    <Button
                        className="outline-none"
                        onPress={e => onSubmit(text, e)}
                    >
                        <img src={CheckIcon} className="w-6 h-6" />
                    </Button>
                    <Button onPress={onCancel} className="outline-none ml-1">
                        <div className="w-6 h-6 flex items-center justify-center">
                            <img src={CancelIcon} alt="" />
                        </div>
                    </Button>
                </div>
            </div>
        </ClickAwayListener>
    );
};
