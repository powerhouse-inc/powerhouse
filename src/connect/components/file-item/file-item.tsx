import BudgetImg from '@/assets/icons/budget.png';
import GlobalImg from '@/assets/icons/global.png';
import LegalImg from '@/assets/icons/legal.png';
import ProfileImg from '@/assets/icons/profile.png';
import TemplateImg from '@/assets/icons/template.png';
import { DivProps, Icon } from '@/powerhouse';
import React from 'react';
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
    onOptionsClick?: DivProps['onClick'];
    icon?: FileItemIconType;
    customIcon?: React.ReactNode;
}

export const FileItem: React.FC<FileItemProps> = ({
    title,
    subTitle,
    customIcon,
    onOptionsClick,
    icon = 'global',
    ...divProps
}) => {
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
                    onOptionsClick?.(e);
                }}
            >
                <Icon
                    name="vertical-dots"
                    className="hidden group-hover:inline-block"
                    size={24}
                />
            </div>
        </div>
    );
};
