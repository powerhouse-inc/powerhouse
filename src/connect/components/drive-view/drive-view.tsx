import IconGear from '@/assets/icons/gear.svg?react';
import { Button } from 'react-aria-components';
import { twMerge } from 'tailwind-merge';
import { ConnectTreeView, ConnectTreeViewProps, TreeItem } from '..';

export type DriveType = 'public' | 'local' | 'cloud';

export interface DriveViewProps
    extends Pick<
            ConnectTreeViewProps,
            | 'onDropEvent'
            | 'onItemClick'
            | 'onItemOptionsClick'
            | 'defaultItemOptions'
        >,
        React.HTMLAttributes<HTMLDivElement> {
    type: DriveType;
    name: string;
    items: TreeItem[];
}

export const DriveView: React.FC<DriveViewProps> = ({
    className,
    type,
    name,
    items,
    onDropEvent,
    onItemClick,
    onItemOptionsClick,
    defaultItemOptions,
    ...props
}) => {
    return (
        <div
            className={twMerge(
                'pb-2',
                type === 'public' && 'bg-bg to-bg rounded-lg',
                className,
            )}
            {...props}
        >
            <div className="border-y border-bg px-4 py-3 flex items-center justify-between">
                <p className="text-[#9EA0A1] font-medium text-sm leading-6">
                    {name}
                </p>
                <Button>
                    <IconGear />
                </Button>
            </div>
            <div className="py-2">
                {items.map(item => (
                    <ConnectTreeView
                        key={item.id}
                        items={item}
                        onDropEvent={onDropEvent}
                        onItemClick={onItemClick}
                        onItemOptionsClick={onItemOptionsClick}
                        defaultItemOptions={defaultItemOptions}
                    />
                ))}
            </div>
        </div>
    );
};
