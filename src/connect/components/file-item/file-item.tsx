import BudgetImg from '@/assets/icons/budget.png';
import GlobalImg from '@/assets/icons/global.png';
import LegalImg from '@/assets/icons/legal.png';
import ProfileImg from '@/assets/icons/profile.png';
import TemplateImg from '@/assets/icons/template.png';
import {
    ConnectDropdownMenu,
    ConnectDropdownMenuProps,
    TreeItem,
    defaultDropdownMenuOptions,
} from '@/connect';
import {
    DivProps,
    Icon,
    TreeViewInput,
    TreeViewInputProps,
    UseDraggableTargetProps,
    useDraggableTarget,
} from '@/powerhouse';
import React, { useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { SyncStatusIcon } from '../status-icon';

const iconMap = {
    legal: LegalImg,
    global: GlobalImg,
    profile: ProfileImg,
    budget: BudgetImg,
    template: TemplateImg,
};

export type FileItemIconType = keyof typeof iconMap;

export interface FileItemProps
    extends Omit<DivProps, 'onDragStart' | 'onDragEnd'> {
    title: string;
    subTitle?: string;
    mode?: 'write' | 'read';
    icon?: FileItemIconType;
    customIcon?: React.ReactNode;
    itemOptions?: ConnectDropdownMenuProps['items'];
    isAllowedToCreateDocuments?: boolean;
    onOptionsClick: ConnectDropdownMenuProps['onItemClick'];
    onSubmitInput?: TreeViewInputProps['onSubmitInput'];
    onCancelInput?: TreeViewInputProps['onCancelInput'];
    item: TreeItem;
    onDragStart?: UseDraggableTargetProps<TreeItem>['onDragStart'];
    onDragEnd?: UseDraggableTargetProps<TreeItem>['onDragEnd'];
    displaySyncIcon?: boolean;
}

export const FileItem: React.FC<FileItemProps> = ({
    title,
    subTitle,
    customIcon,
    itemOptions,
    onOptionsClick,
    mode = 'read',
    icon = 'global',
    item,
    isAllowedToCreateDocuments = true,
    onDragEnd,
    onDragStart,
    onCancelInput = () => {},
    onSubmitInput = () => {},
    displaySyncIcon = false,
    ...divProps
}) => {
    const containerRef = useRef(null);
    const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);

    const { dragProps } = useDraggableTarget({
        data: item,
        onDragEnd,
        onDragStart,
    });

    const isReadMode = mode === 'read';

    const containerStyles = twMerge(
        'group flex h-12 cursor-pointer select-none items-center rounded-lg bg-gray-200 px-2 text-gray-600 hover:text-gray-800',
        divProps.className,
    );

    const iconNode = customIcon || (
        <div className="relative">
            <img
                src={iconMap[icon]}
                alt="file icon"
                className="max-w-none"
                width={32}
                height={34}
            />
            {isReadMode && displaySyncIcon && item.syncStatus && (
                <div className="absolute bottom-[-2px] right-0 size-3 rounded-full bg-white">
                    <div className="absolute left-[-2px] top-[-2px]">
                        <SyncStatusIcon syncStatus={item.syncStatus} />
                    </div>
                </div>
            )}
        </div>
    );

    const content = isReadMode ? (
        <>
            <div className="max-h-6 truncate text-sm font-medium group-hover:text-gray-800">
                {title}
            </div>
            <div className="max-h-6 truncate text-xs font-medium text-gray-600 group-hover:text-gray-800">
                {subTitle}
            </div>
        </>
    ) : (
        <TreeViewInput
            className="ml-3 flex-1 font-medium"
            defaultValue={title}
            onCancelInput={onCancelInput}
            onSubmitInput={onSubmitInput}
        />
    );

    return (
        <div className="relative" ref={containerRef}>
            <div {...dragProps} {...divProps} className={containerStyles}>
                <div className="relative flex flex-1 flex-row items-center overflow-hidden">
                    <div className="mr-1.5">{iconNode}</div>
                    <div
                        className={twMerge(
                            'overflow-hidden text-gray-800',
                            !isReadMode && 'w-full',
                        )}
                    >
                        {content}
                    </div>
                </div>
                {isReadMode && isAllowedToCreateDocuments && (
                    <div
                        onClick={e => {
                            e.stopPropagation();
                            setIsDropdownMenuOpen(true);
                        }}
                    >
                        <Icon
                            name="vertical-dots"
                            className="hidden group-hover:inline-block"
                            size={24}
                        />
                    </div>
                )}
            </div>
            {isAllowedToCreateDocuments && (
                <ConnectDropdownMenu
                    isOpen={isDropdownMenuOpen}
                    onOpenChange={() =>
                        setIsDropdownMenuOpen(!isDropdownMenuOpen)
                    }
                    items={itemOptions || [...defaultDropdownMenuOptions]}
                    menuClassName="bg-white cursor-pointer"
                    menuItemClassName="hover:bg-slate-50 px-2"
                    onItemClick={onOptionsClick}
                    popoverProps={{
                        triggerRef: containerRef,
                        placement: 'bottom end',
                        offset: -10,
                    }}
                />
            )}
        </div>
    );
};
