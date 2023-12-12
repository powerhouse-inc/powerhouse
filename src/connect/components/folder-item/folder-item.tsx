import {
    ConnectDropdownMenu,
    ConnectDropdownMenuProps,
    defaultDropdownMenuOptions,
} from '@/connect';
import { DivProps, Icon } from '@/powerhouse';
import React, { useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';

export interface FolderItemProps extends DivProps {
    title: string;
    itemOptions?: ConnectDropdownMenuProps['items'];
    onOptionsClick: ConnectDropdownMenuProps['onItemClick'];
}

export const FolderItem: React.FC<FolderItemProps> = ({
    title,
    itemOptions,
    onOptionsClick,
    ...divProps
}) => {
    const containerRef = useRef(null);
    const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);

    const containerStyles = twMerge(
        'group flex h-12 cursor-pointer select-none items-center rounded-lg bg-gray-200 px-2 text-gray-600 hover:text-gray-800',
        divProps.className,
    );

    return (
        <div className="relative" ref={containerRef}>
            <div {...divProps} className={containerStyles}>
                <div className="relative flex flex-1 flex-row items-center overflow-hidden">
                    <div className="p-1">
                        <Icon name="folder-close" size={24} />
                    </div>
                    <div className="ml-3 max-h-6 overflow-hidden whitespace-nowrap font-medium text-slate-200 group-hover:text-gray-800">
                        {title}
                    </div>
                    <div className="absolute right-0 h-full w-12 bg-gradient-to-r from-transparent to-gray-200" />
                </div>
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
            </div>
            <ConnectDropdownMenu
                isOpen={isDropdownMenuOpen}
                onOpenChange={() => setIsDropdownMenuOpen(!isDropdownMenuOpen)}
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
        </div>
    );
};
