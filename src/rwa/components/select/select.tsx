import { Icon, mergeClassNameProps } from '@/powerhouse';
import React, { useRef } from 'react';
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

export type OptionsType = { id: string; label: string };

export interface RWASelectProps extends SelectProps<OptionsType> {
    label?: string;
    options: OptionsType[];
    buttonProps?: ButtonProps;
    listBoxProps?: ListBoxProps<OptionsType>;
    listBoxItemProps?: ListBoxItemProps;
}

export const RWASelect: React.FC<RWASelectProps> = props => {
    const {
        label,
        options,
        buttonProps = {},
        listBoxProps = {},
        listBoxItemProps = {},
        ...selectProps
    } = props;

    const buttonRef = useRef(null);

    return (
        <Select {...selectProps}>
            {label && (
                <Label className="mb-2 text-xs text-gray-600">{label}</Label>
            )}
            <Button
                ref={buttonRef}
                {...mergeClassNameProps(
                    buttonProps,
                    'flex h-[42px] items-center justify-between gap-x-2 rounded-xl bg-gray-100 px-3 text-xs outline-none',
                )}
            >
                <SelectValue />
                <span aria-hidden="true">
                    <Icon name="caret-down" size={16} />
                </span>
            </Button>
            <Popover triggerRef={buttonRef}>
                <ListBox
                    {...mergeClassNameProps(
                        listBoxProps,
                        'modal-shadow rounded-xl bg-white py-3 text-xs outline-none',
                    )}
                >
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
            </Popover>
        </Select>
    );
};
