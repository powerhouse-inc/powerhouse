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
                    'flex text-xs px-3 h-[42px] bg-gray-100 rounded-xl items-center gap-x-2 outline-none justify-between',
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
                        'py-3 outline-none modal-shadow rounded-xl text-xs bg-white',
                    )}
                >
                    {options.map(option => (
                        <ListBoxItem
                            key={option.id}
                            id={option.id}
                            {...mergeClassNameProps(
                                listBoxItemProps,
                                'px-3 py-2 cursor-pointer hover:bg-gray-100 outline-none',
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
