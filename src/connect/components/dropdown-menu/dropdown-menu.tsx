import { ControlledDropdownMenuProps, DropdownMenu } from '@/powerhouse';
import { ReactNode, useMemo } from 'react';
import { twMerge } from 'tailwind-merge';

export interface ConnectDropdownMenuItem<TItemId extends string> {
    id: TItemId;
    label: ReactNode;
    icon?: React.JSX.Element;
    className?: string;
}

export interface ConnectDropdownMenuProps<TItemId extends string>
    extends Omit<ControlledDropdownMenuProps<TItemId>, 'items'> {
    items: ConnectDropdownMenuItem<TItemId>[];
}

export function ConnectDropdownMenu<TItemId extends string>(
    props: ConnectDropdownMenuProps<TItemId>,
) {
    const { items, onItemClick, menuClassName, ...dropDownProps } = props;

    const dropdownItems = useMemo(
        () =>
            items.map(({ id, className, label, icon }) => ({
                id,
                content: (
                    <div
                        key={id}
                        className={twMerge(
                            'flex h-9 flex-row items-center px-3',
                            className,
                        )}
                    >
                        {icon && (
                            <span className="mr-2 inline-block">{icon}</span>
                        )}
                        <div>{label}</div>
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
                'modal-shadow rounded-2xl py-3 text-sm font-medium text-slate-200',
                menuClassName,
            )}
            {...dropDownProps}
        />
    );
}
