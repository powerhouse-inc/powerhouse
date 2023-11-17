import React, { useLayoutEffect, useRef, useState } from 'react';
import { useKeyboard } from 'react-aria';
import { Button, Input, PressEvent, TextField } from 'react-aria-components';
import ClickAwayListener from 'react-click-away-listener';
import { twMerge } from 'tailwind-merge';

export interface TreeViewInputProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSubmit'> {
    icon?: React.ReactNode;
    cancelIcon?: React.ReactNode;
    submitIcon: React.ReactNode;
    level?: number;
    initialValue?: string;
    placeholder?: string;
    onCancel?: () => void;
    onSubmit: (value: string, event?: PressEvent) => void;
    'aria-label'?: string;
}

export const TreeViewInput: React.FC<TreeViewInputProps> = props => {
    const {
        icon,
        level = 0,
        submitIcon,
        cancelIcon,
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

    const paddingLeft = 10 * level + 24;

    return (
        <ClickAwayListener onClickAway={() => onSubmit(text)}>
            <div
                className={twMerge(
                    'flex flex-row items-center pr-5',
                    className,
                )}
                style={{
                    paddingLeft,
                    ...style,
                }}
                {...keyboardProps}
                {...containerProps}
            >
                {icon}
                <TextField
                    className="ml-2 flex min-w-0 flex-1"
                    value={text}
                    onChange={setText}
                    aria-label={ariaLabel}
                    autoFocus
                >
                    <Input
                        className="flex min-w-0 flex-1 bg-inherit outline-none"
                        placeholder={placeholder}
                        ref={inputRef}
                    />
                </TextField>
                <div className="flex flex-row items-center">
                    <Button
                        className="outline-none"
                        onPress={e => onSubmit(text, e)}
                    >
                        {submitIcon}
                    </Button>
                    {cancelIcon && (
                        <Button
                            onPress={onCancel}
                            className="ml-1 outline-none"
                        >
                            {cancelIcon}
                        </Button>
                    )}
                </div>
            </div>
        </ClickAwayListener>
    );
};
