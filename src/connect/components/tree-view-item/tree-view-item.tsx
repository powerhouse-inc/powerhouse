import {
    ConnectDropdownMenu,
    ConnectDropdownMenuItem,
    DriveSettingsFormSubmitHandler,
    DriveSettingsModal,
    StatusIndicator,
    TreeItem,
    defaultDropdownMenuOptions,
    getIsMouseInsideContainer,
} from '@/connect';
import {
    DivProps,
    Icon,
    TreeViewItem,
    UseDraggableTargetProps,
    useDraggableTarget,
} from '@/powerhouse';
import { MouseEventHandler, useEffect, useRef, useState } from 'react';
import { twJoin, twMerge } from 'tailwind-merge';

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
    itemContainerProps?: DivProps;
    disableDropBetween?: boolean;
    onDragStart?: UseDraggableTargetProps<TreeItem>['onDragStart'];
    onDragEnd?: UseDraggableTargetProps<TreeItem>['onDragEnd'];
    disableHighlightStyles?: boolean;
};

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
    const [isDriveSettingsModalOpen, setIsDriveSettingsModalOpen] =
        useState(false);
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
    const isDrive =
        item.type === 'local-drive' ||
        item.type === 'cloud-drive' ||
        item.type === 'public-drive';
    const itemOptions =
        item.options ?? (defaultOptions as ConnectDropdownMenuItem[]);
    const dropdownMenuItems = isDrive
        ? [
              {
                  id: 'settings',
                  label: 'Settings',
                  icon: <Icon name="gear" />,
              },
              ...itemOptions,
          ]
        : itemOptions;

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

    function onItemOptionsClick(option: string) {
        if (option === 'settings') {
            setIsDriveSettingsModalOpen(true);
            return;
        }
        onOptionsClick?.(item, option);
    }

    const onClickHandler: MouseEventHandler<HTMLDivElement> = event => {
        if (props.mode === 'write') return;
        onClick(event);
    };

    function onSubmitHandler(value: string) {
        onSubmitInput?.({ ...item, label: value });
    }

    const driveSettingsFormSubmitHandler: DriveSettingsFormSubmitHandler =
        data => {
            onOptionsClick?.(
                { ...item, label: data.driveName },
                'rename-drive',
            );
            onOptionsClick?.(
                { ...item, sharingType: data.sharingType },
                'change-sharing-type',
            );
            onOptionsClick?.(
                {
                    ...item,
                    status: data.availableOffline
                        ? 'available-offline'
                        : 'available',
                },
                'change-availability',
            );
            setIsDriveSettingsModalOpen(false);
        };

    function onDeleteDriveHandler() {
        onOptionsClick?.(item, 'delete-drive');
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

    function getItemIcon() {
        switch (item.type) {
            case 'folder':
                return {
                    icon: <Icon name="folder-close" color="#6C7275" />,
                    expandedIcon: <Icon name="folder-open" color="#6C7275" />,
                };
            case 'file':
                return {};
            case 'local-drive':
                return { icon: <Icon name="hdd" /> };
            case 'cloud-drive':
                return { icon: <Icon name="server" /> };
            case 'public-drive':
                return { icon: <Icon name="m" /> };
        }
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
        if (item.type === 'local-drive') {
            return (
                <StatusIndicator
                    type="local-drive"
                    error={item.error}
                    iconProps={iconProps}
                />
            );
        }

        if (item.type === 'cloud-drive' || item.type === 'public-drive') {
            const sharedProps = {
                type: item.type,
                error: item.error,
                isConnected: item.isConnected ?? false,
                iconProps,
            };

            if (item.status === 'available-offline') {
                return (
                    <StatusIndicator
                        {...sharedProps}
                        availability="available-offline"
                        syncStatus={item.syncStatus ?? 'not-synced-yet'}
                    />
                );
            }

            if (item.status === 'available') {
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
                {...getItemIcon()}
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
                items={dropdownMenuItems}
                menuClassName="bg-white cursor-pointer"
                menuItemClassName="hover:bg-[#F1F5F9] px-2"
                onItemClick={onItemOptionsClick}
                popoverProps={{
                    triggerRef: containerRef,
                    placement: 'bottom end',
                    offset: -10,
                }}
            />
            {isDrive && (
                <DriveSettingsModal
                    formProps={{
                        driveName: item.label,
                        // todo: make this required for drives
                        sharingType: item.sharingType ?? 'public',
                        availableOffline: item.status === 'available-offline',
                        location:
                            item.type === 'local-drive' ? 'local' : 'cloud',
                        onCancel() {
                            setIsDriveSettingsModalOpen(false);
                        },
                        onDeleteDrive: onDeleteDriveHandler,
                        onSubmit: driveSettingsFormSubmitHandler,
                    }}
                    modalProps={{
                        open: isDriveSettingsModalOpen,
                        onClose: () => setIsDriveSettingsModalOpen(false),
                    }}
                />
            )}
        </article>
    );
}
