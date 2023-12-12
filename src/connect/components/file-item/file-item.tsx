import BudgetImg from '@/assets/icons/budget.png';
import GlobalImg from '@/assets/icons/global.png';
import LegalImg from '@/assets/icons/legal.png';
import ProfileImg from '@/assets/icons/profile.png';
import TemplateImg from '@/assets/icons/template.png';
import {
    ConnectDropdownMenu,
    ConnectDropdownMenuProps,
    defaultDropdownMenuOptions,
} from '@/connect';
import { DivProps, Icon } from '@/powerhouse';
import React, { useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';

const iconMap = {
    legal: LegalImg,
    global: GlobalImg,
    profile: ProfileImg,
    budget: BudgetImg,
    template: TemplateImg,
};

export type FileItemIconType = keyof typeof iconMap;

export interface FileItemProps extends DivProps {
    title: string;
    subTitle?: string;
    icon?: FileItemIconType;
    customIcon?: React.ReactNode;
    itemOptions?: ConnectDropdownMenuProps['items'];
    onOptionsClick: ConnectDropdownMenuProps['onItemClick'];
}

export const FileItem: React.FC<FileItemProps> = ({
    title,
    subTitle,
    customIcon,
    itemOptions,
    onOptionsClick,
    icon = 'global',
    ...divProps
}) => {
    const containerRef = useRef(null);
    const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);

    const containerStyles = twMerge(
        'group flex h-12 cursor-pointer select-none items-center rounded-lg bg-gray-200 px-2 text-gray-600 hover:text-gray-800',
        divProps.className,
    );

    const iconNode = customIcon || (
        <img
            src={iconMap[icon]}
            alt="file icon"
            className="max-w-none"
            width={32}
            height={34}
        />
    );

    return (
        <div className="relative" ref={containerRef}>
            <div {...divProps} className={containerStyles}>
                <div className="relative flex flex-1 flex-row items-center overflow-hidden">
                    <div className="mr-1.5">{iconNode}</div>
                    <div className="overflow-hidden text-gray-800">
                        <div className="max-h-6 truncate text-sm font-medium">
                            {title}
                        </div>
                        <div className="max-h-6 truncate text-xs font-medium text-gray-600">
                            {subTitle}
                        </div>
                    </div>
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
