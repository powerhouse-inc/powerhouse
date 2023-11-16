import { Icon } from '@/powerhouse';
import type { DropItem } from '@/powerhouse/hooks';
import type { DragEndEvent, DragStartEvent, DropEvent } from 'react-aria';
import { Button } from 'react-aria-components';
import { twMerge } from 'tailwind-merge';
import {
    ConnectTreeView,
    ConnectTreeViewItemProps,
    DefaultOptionId,
    ItemType,
    TreeItem,
} from '..';

export type DriveType = 'public' | 'local' | 'cloud';

export interface DriveTreeItem<T extends string = DefaultOptionId>
    extends TreeItem<T> {
    type: ItemType.LocalDrive | ItemType.NetworkDrive | ItemType.PublicDrive;
}

export type OnItemOptionsClickHandler<T extends string = DefaultOptionId> = (
    item: TreeItem<T>,
    option: T,
    drive: DriveTreeItem<T>,
) => void;

export interface DriveViewProps<T extends string = DefaultOptionId>
    extends Omit<
        React.HTMLAttributes<HTMLDivElement>,
        'onDragEnd' | 'onDragStart'
    > {
    type: DriveType;
    name: string;
    drives: DriveTreeItem<T>[];
    defaultItemOptions?: ConnectTreeViewItemProps<T>['defaultOptions'];
    onDropEvent?: (
        item: DropItem<TreeItem<T>>,
        target: TreeItem<T>,
        event: DropEvent,
        drive: DriveTreeItem<T>,
    ) => void;
    onItemClick?: (
        event: React.MouseEvent<HTMLDivElement, MouseEvent>,
        item: TreeItem<T>,
        drive: DriveTreeItem<T>,
    ) => void;
    onSubmitInput?: (item: TreeItem, drive: DriveTreeItem<T>) => void;
    onCancelInput?: (item: TreeItem, drive: DriveTreeItem<T>) => void;
    onItemOptionsClick?: OnItemOptionsClickHandler<T>;
    disableHighlightStyles?: boolean;

    onDropActivate?: (
        drive: DriveTreeItem<T>,
        dropTargetItem: TreeItem,
    ) => void;
    onDragStart?: (
        drive: DriveTreeItem<T>,
        dragItem: TreeItem,
        event: DragStartEvent,
    ) => void;
    onDragEnd?: (
        drive: DriveTreeItem<T>,
        dragItem: TreeItem,
        event: DragEndEvent,
    ) => void;
}

export function DriveView<T extends string = DefaultOptionId>(
    props: DriveViewProps<T>,
) {
    const {
        className,
        type,
        name,
        drives,
        onDropEvent,
        onItemClick,
        onSubmitInput,
        onItemOptionsClick,
        defaultItemOptions,
        onDropActivate,
        onDragStart,
        onDragEnd,
        onCancelInput,
        disableHighlightStyles,
        ...restProps
    } = props;
    return (
        <div
            className={twMerge(
                'pb-2',
                type === 'public' && 'bg-bg to-bg rounded-lg',
                className,
            )}
            {...restProps}
        >
            <div className="border-y border-bg px-4 py-3 flex items-center justify-between">
                <p className="text-[#9EA0A1] font-medium text-sm leading-6">
                    {name}
                </p>
                <Button>
                    <Icon name="gear" size={16} color="#6C7275" />
                </Button>
            </div>
            <div className="py-2">
                {drives.map(drive => (
                    <ConnectTreeView<T>
                        key={drive.id}
                        items={drive}
                        disableHighlightStyles={disableHighlightStyles}
                        onDragEnd={(...args) => onDragEnd?.(drive, ...args)}
                        onDragStart={(...args) => onDragStart?.(drive, ...args)}
                        onDropEvent={(...args) => onDropEvent?.(...args, drive)}
                        onItemClick={(...args) => onItemClick?.(...args, drive)}
                        onDropActivate={(...args) =>
                            onDropActivate?.(drive, ...args)
                        }
                        onCancelInput={(...args) =>
                            onCancelInput?.(...args, drive)
                        }
                        onSubmitInput={(...args) =>
                            onSubmitInput?.(...args, drive)
                        }
                        onItemOptionsClick={(...args) =>
                            onItemOptionsClick?.(...args, drive)
                        }
                        defaultItemOptions={defaultItemOptions}
                    />
                ))}
            </div>
        </div>
    );
}
