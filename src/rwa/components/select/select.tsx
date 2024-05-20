import { Icon, mergeClassNameProps } from '@/powerhouse';
import React, { ReactNode, useRef } from 'react';
import {
    Button,
    ButtonProps,
    Label,
    ListBox,
    ListBoxItem,
    ListBoxItemProps,
    ListBoxProps,
    Popover,
    Select,
    SelectProps,
    SelectValue,
} from 'react-aria-components';
import { twMerge } from 'tailwind-merge';

export type OptionsType = { id: string; label: string };

export interface RWASelectProps extends SelectProps<OptionsType> {
    label?: string;
    options: OptionsType[];
    buttonProps?: ButtonProps;
    listBoxProps?: ListBoxProps<OptionsType>;
    listBoxItemProps?: ListBoxItemProps;
    createItemButtonProps?: {
        label: ReactNode;
        onClick: () => void;
    };
}

export const RWASelect: React.FC<RWASelectProps> = props => {
    const {
        label,
        options,
        buttonProps = {},
        listBoxProps = {},
        listBoxItemProps = {},
        createItemButtonProps,
        ...selectProps
    } = props;

    const { className } = buttonProps;
    const buttonRef = useRef(null);

    return (
        <Select {...selectProps} className="">
            {label && (
                <Label className="mb-2 text-xs text-gray-600">{label}</Label>
            )}
            <Button
                ref={buttonRef}
                {...buttonProps}
                className={twMerge(
                    'group flex h-8 w-full items-center justify-between gap-x-2 rounded-md bg-gray-100 px-3 text-xs outline-none disabled:bg-transparent disabled:p-0',
                    className as string,
                )}
            >
                <SelectValue />
                <span className="group-disabled:hidden" aria-hidden="true">
                    <Icon name="caret-down" size={16} />
                </span>
            </Button>
            <Popover triggerRef={buttonRef}>
                <div className="modal-shadow w-[--trigger-width] rounded-xl bg-white py-3 text-xs outline-none">
                    <ListBox {...listBoxProps}>
                        {options.map(option => (
                            <ListBoxItem
                                key={option.id}
                                id={option.id}
                                {...mergeClassNameProps(
                                    listBoxItemProps,
                                    'cursor-pointer px-3 py-2 outline-none hover:bg-gray-100',
                                )}
                            >
                                {option.label}
                            </ListBoxItem>
                        ))}
                    </ListBox>
                    {createItemButtonProps && (
                        <button
                            onClick={createItemButtonProps.onClick}
                            className="w-full cursor-pointer px-3 py-2 outline-none hover:bg-gray-100"
                        >
                            {createItemButtonProps.label}
                        </button>
                    )}
                </div>
            </Popover>
        </Select>
    );
};
