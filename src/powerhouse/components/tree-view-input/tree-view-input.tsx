import React, { useState } from 'react';
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
                    className="flex flex-1 ml-1 min-w-0"
                    value={text}
                    onChange={setText}
                    aria-label={ariaLabel}
                    autoFocus
                >
                    <Input
                        className="flex flex-1 outline-none bg-inherit min-w-0"
                        placeholder={placeholder}
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
                            className="outline-none ml-1"
                        >
                            {cancelIcon}
                        </Button>
                    )}
                </div>
            </div>
        </ClickAwayListener>
    );
};
