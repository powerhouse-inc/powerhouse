import {
    CLOUD_DRIVE,
    ConnectDropdownMenu,
    ConnectDropdownMenuItem,
    DriveSettingsFormSubmitHandler,
    DriveSettingsModal,
    DriveTreeItem,
    FILE,
    FOLDER,
    LOCAL_DRIVE,
    PUBLIC_DRIVE,
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
import {
    getIsCloudDrive,
    getIsDrive,
    getIsPublicDrive,
} from '../drive-view/utils';
import { SyncStatusIcon } from '../status-icon';

const submitIcon = <Icon name="check" className="text-gray-600" />;
const cancelIcon = <Icon name="xmark" className="text-gray-600" />;

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
    isAllowedToCreateDocuments?: boolean;
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
        isAllowedToCreateDocuments = true,
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

    const isWriteMode = props.mode === 'write';
    const isHighlighted = getIsHighlighted();
    const showDropdownMenuButton = mouseIsWithinItemContainer && !isWriteMode;
    const isDrive = getIsDrive(item);
    const isCloudDrive = getIsCloudDrive(item);
    const isPublicDrive = getIsPublicDrive(item);
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
        <button
            onClick={() => setIsDropdownMenuOpen(true)}
            className="absolute right-1 top-3"
        >
            <Icon name="vertical-dots" className="text-gray-600" />
        </button>
    );

    const bottomIndicator = (
        <div
            {...dropDividerProps}
            className="absolute -bottom-0.5 z-10 flex h-1 w-full flex-row items-center"
        >
            <div
                className={twJoin(
                    'h-0.5 w-full',
                    isDropDividerTarget && 'bg-blue-800',
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
                    availableOffline: data.availableOffline,
                },
                'change-availability',
            );
            if (getIsPublicDrive(item)) {
                onOptionsClick?.(
                    {
                        ...item,
                        icon: data.driveIcon,
                    } as DriveTreeItem,
                    'change-icon',
                );
            }

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
        if (isWriteMode) return true;
        if (isDropdownMenuOpen) return true;
        return false;
    }

    function getItemIcon() {
        if (isPublicDrive && item.icon) {
            return {
                icon: (
                    <img src={item.icon} className="size-7" alt="drive icon" />
                ),
            };
        }
        switch (item.type) {
            case FOLDER:
                return {
                    icon: (
                        <Icon name="folder-close" className="text-gray-600" />
                    ),
                    expandedIcon: (
                        <Icon name="folder-open" className="text-gray-600" />
                    ),
                };
            case FILE:
                return {};
            case LOCAL_DRIVE:
                return { icon: <Icon name="hdd" /> };
            case CLOUD_DRIVE:
                return { icon: <Icon name="server" /> };
            case PUBLIC_DRIVE:
                return { icon: <Icon name="m" /> };
        }
    }

    function getItemContainerProps() {
        const { className: itemContainerClassName, ...restItemContainerProps } =
            itemContainerProps;

        const backgroundClass = isHighlighted ? 'bg-slate-50' : '';

        const className = twMerge(
            'rounded-lg py-3 transition-colors hover:bg-slate-50 peer-hover:bg-slate-50',
            backgroundClass,
            itemContainerClassName,
            item.isSelected && 'bg-slate-50',
        );

        return {
            className,
            ref: containerRef,
            ...restItemContainerProps,
        };
    }
    function statusIconOrDropdownMenuButton() {
        if (showDropdownMenuButton && isAllowedToCreateDocuments)
            return dropdownMenuButton;
        if ((isCloudDrive || isPublicDrive) && item.syncStatus) {
            return (
                <SyncStatusIcon
                    syncStatus={item.syncStatus}
                    className="absolute right-2 top-4"
                />
            );
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
                submitIcon={submitIcon}
                cancelIcon={cancelIcon}
                {...getItemIcon()}
                {...divProps}
            >
                {children}
            </TreeViewItem>
            {statusIconOrDropdownMenuButton()}
            {isAllowedToCreateDocuments && (
                <ConnectDropdownMenu
                    isOpen={isDropdownMenuOpen}
                    onOpenChange={onDropdownMenuOpenChange}
                    items={dropdownMenuItems}
                    menuClassName="bg-white cursor-pointer"
                    menuItemClassName="hover:bg-slate-50 px-2"
                    onItemClick={onItemOptionsClick}
                    popoverProps={{
                        triggerRef: containerRef,
                        placement: 'bottom end',
                        offset: -10,
                    }}
                />
            )}
            {isDrive && isAllowedToCreateDocuments && (
                <DriveSettingsModal
                    formProps={{
                        driveName: item.label,
                        // todo: make this required for drives
                        sharingType: item.sharingType ?? 'PUBLIC',
                        availableOffline: item.availableOffline,
                        location:
                            item.type === 'LOCAL_DRIVE' ? 'LOCAL' : 'CLOUD',
                        onCancel() {
                            setIsDriveSettingsModalOpen(false);
                        },
                        onDeleteDrive: onDeleteDriveHandler,
                        onSubmit: driveSettingsFormSubmitHandler,
                    }}
                    modalProps={{
                        open: isDriveSettingsModalOpen,
                        onOpenChange: setIsDriveSettingsModalOpen,
                    }}
                />
            )}
        </article>
    );
}
