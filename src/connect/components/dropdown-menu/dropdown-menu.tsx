import { DropdownMenu, DropdownMenuProps } from '@/powerhouse';
import { useMemo } from 'react';
import { twMerge } from 'tailwind-merge';

export interface ConnectDropdownMenuItem<T extends string = string> {
    id: T;
    icon?: string;
    label: string;
    className?: string;
}

export interface ConnectDropdownMenuProps<T extends string = string>
    extends Omit<DropdownMenuProps<T>, 'items'> {
    items: ConnectDropdownMenuItem<T>[];
}

export function ConnectDropdownMenu<T extends string = string>(
    props: ConnectDropdownMenuProps<T>,
) {
    const { items, children, onItemClick, menuClassName, ...dropDownProps } =
        props;

    const dropdownItems = useMemo<DropdownMenuProps<T>['items']>(
        () =>
            items.map(item => ({
                id: item.id,
                content: (
                    <div
                        key={item.id}
                        className={twMerge(
                            'flex flex-row h-9 items-center px-3',
                            item.className,
                        )}
                    >
                        {item.icon && (
                            <img src={item.icon} className="h-6 w-6 mr-2" />
                        )}
                        <div>{item.label}</div>
                    </div>
                ),
            })),
        [items],
    );

    return (
        <DropdownMenu<T>
            items={dropdownItems}
            onItemClick={onItemClick}
            menuClassName={twMerge(
                'py-3 rounded-2xl modal-shadow text-sm font-medium text-[#6F767E]',
                menuClassName,
            )}
            {...dropDownProps}
        >
            {children}
        </DropdownMenu>
    );
}
