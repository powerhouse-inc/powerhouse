import IconGear from '@/assets/icons/gear.svg?react';
import type { DropEvent } from 'react-aria';
import { Button } from 'react-aria-components';
import { twMerge } from 'tailwind-merge';
import { ConnectTreeView, ConnectTreeViewProps, ItemType, TreeItem } from '..';

export type DriveType = 'public' | 'local' | 'cloud';

export interface DriveTreeItem extends TreeItem {
    type: ItemType.LocalDrive | ItemType.NetworkDrive | ItemType.PublicDrive;
}

export interface DriveViewProps
    extends Pick<ConnectTreeViewProps, 'defaultItemOptions'>,
        React.HTMLAttributes<HTMLDivElement> {
    type: DriveType;
    name: string;
    drives: DriveTreeItem[];
    onDropEvent?: (
        item: TreeItem,
        target: TreeItem,
        event: DropEvent,
        drive: DriveTreeItem,
    ) => void;
    onItemClick?: (
        event: React.MouseEvent<HTMLDivElement, MouseEvent>,
        item: TreeItem,
        drive: DriveTreeItem,
    ) => void;
    onItemOptionsClick?: (
        item: TreeItem,
        option: React.Key,
        drive: DriveTreeItem,
    ) => void;
}

export const DriveView: React.FC<DriveViewProps> = ({
    className,
    type,
    name,
    drives,
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
                {drives.map(drive => (
                    <ConnectTreeView
                        key={drive.id}
                        items={drive}
                        onDropEvent={(...args) => onDropEvent?.(...args, drive)}
                        onItemClick={(...args) => onItemClick?.(...args, drive)}
                        onItemOptionsClick={(...args) =>
                            onItemOptionsClick?.(...args, drive)
                        }
                        defaultItemOptions={defaultItemOptions}
                    />
                ))}
            </div>
        </div>
    );
};
