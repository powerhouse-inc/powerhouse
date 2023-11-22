import { getIsMouseInsideContainer } from '@/connect';
import {
    ConnectDropdownMenu,
    ConnectDropdownMenuItem,
} from '@/connect/components/dropdown-menu';
import {
    DivProps,
    Icon,
    ItemContainerProps,
    TreeViewItem,
    UseDraggableTargetProps,
    useDraggableTarget,
} from '@/powerhouse';
import { MouseEventHandler, useEffect, useRef, useState } from 'react';
import { twJoin, twMerge } from 'tailwind-merge';
import { StatusIndicator } from '../status-indicator';

export enum ItemType {
    Folder = 'folder',
    File = 'file',
    LocalDrive = 'local-drive',
    CloudDrive = 'cloud-drive',
    PublicDrive = 'public-drive',
}

export enum ActionType {
    Update = 'update',
    New = 'new',
    UpdateAndMove = 'update-and-move',
    UpdateAndCopy = 'update-and-copy',
}

export enum ItemStatus {
    Available = 'available',
    AvailableOffline = 'available-offline',
    Syncing = 'syncing',
    Offline = 'offline',
}

export interface BaseTreeItem {
    id: string;
    path: string;
    label: string;
    type: ItemType;
    error?: Error;
    status?: ItemStatus;
    isConnected?: boolean;
    options?: ConnectDropdownMenuItem[];
    syncStatus?: 'not-synced-yet' | 'syncing' | 'synced';
    expanded?: boolean;
}

export interface UITreeItem {
    action?: ActionType;
    expanded?: boolean;
    isSelected?: boolean;
}

export type TreeItem = BaseTreeItem & UITreeItem;

export const defaultDropdownMenuOptions = [
    {
        id: 'duplicate',
        label: 'Duplicate',
        icon: <Icon name="files-earmark" />,
    },
    {
        id: 'new-folder',
        label: 'New Folder',
        icon: <Icon name="folder-plus" />,
    },
    {
        id: 'rename',
        label: 'Rename',
        icon: <Icon name="pencil" />,
    },
    {
        id: 'delete',
        label: 'Delete',
        icon: <Icon name="trash" />,
        className: 'text-[#EA4335]',
    },
] as const;

export type DefaultOptionId = (typeof defaultDropdownMenuOptions)[number]['id'];

export type ConnectTreeViewItemProps = {
    item: TreeItem;
    children: React.ReactNode;
    mode?: 'read' | 'write';
    onClick: MouseEventHandler<HTMLDivElement>;
    onSubmitInput?: (item: TreeItem) => void;
    onCancelInput?: (item: TreeItem) => void;
    level?: number;
    divPropsDivProps?: DivProps;
    onDropEvent?: UseDraggableTargetProps<TreeItem>['onDropEvent'];
    onDropActivate?: (dropTargetItem: TreeItem) => void;
    defaultOptions?: ConnectDropdownMenuItem[];
    onOptionsClick?: (item: TreeItem, option: string) => void;
    itemContainerProps?: ItemContainerProps;
    disableDropBetween?: boolean;
    onDragStart?: UseDraggableTargetProps<TreeItem>['onDragStart'];
    onDragEnd?: UseDraggableTargetProps<TreeItem>['onDragEnd'];
    disableHighlightStyles?: boolean;
};

function getItemIcon(type: ItemType) {
    switch (type) {
        case ItemType.Folder:
            return {
                icon: <Icon name="folder-close" color="#6C7275" />,
                expandedIcon: <Icon name="folder-open" color="#6C7275" />,
            };
        case ItemType.File:
            return {};
        case ItemType.LocalDrive:
            return { icon: <Icon name="hdd" /> };
        case ItemType.CloudDrive:
            return { icon: <Icon name="server" /> };
        case ItemType.PublicDrive:
            return { icon: <Icon name="m" /> };
    }
}

export function ConnectTreeViewItem(props: ConnectTreeViewItemProps) {
    const {
        item,
        onClick,
        onSubmitInput,
        onCancelInput,
        children,
        onDragEnd,
        onDragStart,
        onDropEvent,
        onOptionsClick,
        onDropActivate,
        level = 0,
        itemContainerProps = {},
        disableDropBetween = false,
        disableHighlightStyles = false,
        defaultOptions = defaultDropdownMenuOptions,
        ...divProps
    } = props;

    const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);
    const [mouseIsWithinItemContainer, setMouseIsWithinItemContainer] =
        useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const { dragProps, dropProps, isDropTarget, isDragging } =
        useDraggableTarget<TreeItem>({
            onDragEnd,
            onDragStart,
            data: item,
            onDropEvent,
            onDropActivate: () => {
                onDropActivate?.(item);
            },
        });

    const { dropProps: dropDividerProps, isDropTarget: isDropDividerTarget } =
        useDraggableTarget({
            data: item,
            onDropEvent,
            dropAfterItem: true,
        });

    useEffect(() => {
        window.addEventListener('mousemove', onMouseMove);

        return () => {
            window.removeEventListener('mousemove', onMouseMove);
        };
    }, []);

    const isHighlighted = getIsHighlighted();
    const showDropdownMenuButton =
        props.mode === 'read' && (mouseIsWithinItemContainer || isHighlighted);
    const statusIcon = getStatusIcon();

    const dropdownMenuButton = (
        <button onClick={() => setIsDropdownMenuOpen(true)}>
            <Icon name="vertical-dots" color="#6C7275" />
        </button>
    );

    const bottomIndicator = (
        <div
            {...dropDividerProps}
            className="absolute bottom-[-2px] z-[1] flex h-1 w-full flex-row items-center"
        >
            <div
                className={twJoin(
                    'h-0.5 w-full',
                    isDropDividerTarget && 'bg-[#3E90F0]',
                )}
            />
        </div>
    );

    function onMouseMove(event: MouseEvent) {
        const isMouseInsideContainer = getIsMouseInsideContainer(
            containerRef,
            event,
        );
        setMouseIsWithinItemContainer(isMouseInsideContainer);
    }

    function onDropdownMenuOpenChange() {
        setIsDropdownMenuOpen(!isDropdownMenuOpen);
    }

    function onItemClick(option: string) {
        onOptionsClick?.(item, option);
    }

    const onClickHandler: MouseEventHandler<HTMLDivElement> = event => {
        if (props.mode === 'write') return;
        onClick(event);
    };

    function onSubmitHandler(value: string) {
        onSubmitInput?.({ ...item, label: value });
    }

    function onCancelHandler() {
        onCancelInput?.(item);
    }

    function getIsHighlighted() {
        if (isDropTarget) return true;
        if (disableHighlightStyles) return false;
        if (isDragging) return false;
        if (props.mode === 'write') return true;
        if (item.isSelected) return true;
        if (isDropdownMenuOpen) return true;
        return false;
    }

    function getItemContainerProps() {
        const { className: itemContainerClassName, ...restItemContainerProps } =
            itemContainerProps;

        const backgroundClass = isHighlighted ? 'bg-[#F1F5F9]' : '';

        const className = twMerge(
            'hover:bg-[#F1F5F9] peer-hover:bg-[#F1F5F9] py-3 transition-colors rounded-lg',
            backgroundClass,
            itemContainerClassName,
        );

        return {
            className,
            ref: containerRef,
            ...restItemContainerProps,
        };
    }

    function getStatusIcon() {
        const iconProps = {
            className: 'm-1.5',
        };
        if (item.type === ItemType.LocalDrive) {
            return (
                <StatusIndicator
                    type="local-drive"
                    error={item.error}
                    iconProps={iconProps}
                />
            );
        }

        if (
            item.type === ItemType.CloudDrive ||
            item.type === ItemType.PublicDrive
        ) {
            const sharedProps = {
                type: item.type,
                error: item.error,
                isConnected: item.isConnected ?? false,
                iconProps,
            };

            if (item.status === ItemStatus.AvailableOffline) {
                return (
                    <StatusIndicator
                        {...sharedProps}
                        availability="available-offline"
                        syncStatus={item.syncStatus ?? 'not-synced-yet'}
                    />
                );
            }

            if (item.status === ItemStatus.Available) {
                return (
                    <StatusIndicator
                        {...sharedProps}
                        availability="cloud-only"
                    />
                );
            }
        }
    }

    return (
        <article className="relative">
            <TreeViewItem
                {...(onDropEvent && { ...dragProps, ...dropProps })}
                bottomIndicator={!disableDropBetween && bottomIndicator}
                level={level}
                onClick={onClickHandler}
                onSubmitInput={onSubmitHandler}
                onCancelInput={onCancelHandler}
                label={item.label}
                open={item.expanded}
                itemContainerProps={getItemContainerProps()}
                {...getItemIcon(item.type)}
                {...divProps}
            >
                {children}
            </TreeViewItem>
            <div className="absolute right-1 top-3">
                {showDropdownMenuButton ? dropdownMenuButton : statusIcon}
            </div>
            <ConnectDropdownMenu
                isOpen={isDropdownMenuOpen}
                onOpenChange={onDropdownMenuOpenChange}
                items={
                    item.options ??
                    (defaultOptions as ConnectDropdownMenuItem[])
                }
                menuClassName="bg-white cursor-pointer"
                menuItemClassName="hover:bg-[#F1F5F9] px-2"
                onItemClick={onItemClick}
                popoverProps={{
                    triggerRef: containerRef,
                    placement: 'bottom end',
                    offset: -10,
                }}
            />
        </article>
    );
}
