import { Icon } from '@/powerhouse';
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
                onCancel();
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
                        className="bg-inherit outline-none"
                        placeholder={placeholder}
                        ref={inputRef}
                    />
                </TextField>
                <div className="flex items-center gap-1">
                    <Button onPress={e => onSubmit(text, e)}>
                        <Icon name="check" />
                    </Button>
                    <Button onPress={onCancel}>
                        <Icon name="xmark" />
                    </Button>
                </div>
            </div>
        </ClickAwayListener>
    );
};
