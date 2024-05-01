import {
    ComponentPropsWithoutRef,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { useKeyboard } from 'react-aria';
import { Input, PressEvent, TextField } from 'react-aria-components';
import ClickAwayListener from 'react-click-away-listener';
import { twMerge } from 'tailwind-merge';

export interface TreeViewInputProps
    extends Omit<ComponentPropsWithoutRef<'input'>, 'onSubmit'> {
    onCancelInput?: () => void;
    onSubmitInput?: (value: string, event?: PressEvent) => void;
}

export const TreeViewInput: React.FC<TreeViewInputProps> = props => {
    const {
        onSubmitInput,
        onCancelInput,
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
            inputRef.current?.select();
            inputRef.current?.scroll({ left: 9999 });
        }, 100);
    }, []);

    const { keyboardProps } = useKeyboard({
        onKeyUp(e) {
            if (e.key === 'Enter') {
                onSubmitInput?.(text);
            }
            if (e.key === 'Escape') {
                onCancelInput?.();
            }
        },
    });

    return (
        <ClickAwayListener onClickAway={() => onSubmitInput?.(text)}>
            <div
                className={twMerge('flex items-center', className)}
                style={{
                    ...style,
                }}
                {...keyboardProps}
                {...containerProps}
            >
                <TextField
                    className="w-full"
                    value={text}
                    onChange={setText}
                    aria-label={ariaLabel}
                    autoFocus
                >
                    <Input
                        className="w-full bg-inherit outline-none"
                        placeholder={placeholder}
                        ref={inputRef}
                    />
                </TextField>
            </div>
        </ClickAwayListener>
    );
};
