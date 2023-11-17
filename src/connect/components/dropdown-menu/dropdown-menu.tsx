import { DropdownMenu, DropdownMenuProps } from '@/powerhouse';
import { useMemo } from 'react';
import { twMerge } from 'tailwind-merge';

export interface ConnectDropdownMenuItem {
    id: string;
    icon?: React.JSX.Element;
    label: string;
    className?: string;
}

export interface ConnectDropdownMenuProps
    extends Omit<DropdownMenuProps, 'items'> {
    items: ConnectDropdownMenuItem[];
}

export function ConnectDropdownMenu(props: ConnectDropdownMenuProps) {
    const { items, children, onItemClick, menuClassName, ...dropDownProps } =
        props;

    const dropdownItems = useMemo<DropdownMenuProps['items']>(
        () =>
            items.map(item => ({
                id: item.id,
                content: (
                    <div
                        key={item.id}
                        className={twMerge(
                            'flex h-9 flex-row items-center px-3',
                            item.className,
                        )}
                    >
                        {item.icon && (
                            <span className="mr-2 inline-block">
                                {item.icon}
                            </span>
                        )}
                        <div>{item.label}</div>
                    </div>
                ),
            })),
        [items],
    );

    return (
        <DropdownMenu
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
