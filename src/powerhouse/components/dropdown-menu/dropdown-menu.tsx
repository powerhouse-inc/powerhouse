import React from 'react';
import {
    Button,
    Item,
    Menu,
    MenuTrigger,
    Popover,
    PopoverProps,
} from 'react-aria-components';
import { twMerge } from 'tailwind-merge';

export interface DropdownMenuProps<T = string> {
    onItemClick: (itemID: T) => void;
    items: Array<{ id: T; content: React.ReactNode }>;
    children: React.ReactNode;
    className?: string;
    menuClassName?: string;
    menuItemClassName?: string;
    popoverProps?: PopoverProps;
}

export function DropdownMenu<T extends string>(props: DropdownMenuProps<T>) {
    const {
        items,
        children,
        className,
        onItemClick,
        popoverProps,
        menuClassName,
        menuItemClassName,
    } = props;

    return (
        <MenuTrigger>
            <Button
                aria-label="menu"
                className={twMerge('outline-none', className)}
            >
                {children}
            </Button>
            <Popover {...popoverProps}>
                <Menu
                    onAction={key => onItemClick(key as T)}
                    className={twMerge(
                        'outline-none overflow-hidden',
                        menuClassName,
                    )}
                >
                    {items.map(item => (
                        <Item
                            id={item.id}
                            key={item.id}
                            className={twMerge(
                                'outline-none',
                                menuItemClassName,
                            )}
                        >
                            {item.content}
                        </Item>
                    ))}
                </Menu>
            </Popover>
        </MenuTrigger>
    );
}
