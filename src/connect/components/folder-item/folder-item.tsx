import { DivProps, Icon } from '@/powerhouse';
import React from 'react';
import { twMerge } from 'tailwind-merge';

export interface FolderItemProps extends DivProps {
    title: string;
    onOptionsClick?: DivProps['onClick'];
}

export const FolderItem: React.FC<FolderItemProps> = ({
    title,
    onOptionsClick,
    ...divProps
}) => {
    const containerStyles = twMerge(
        'group flex h-12 cursor-pointer select-none items-center rounded-lg bg-gray-200 px-2 text-gray-600 hover:text-gray-800',
        divProps.className,
    );

    return (
        <div {...divProps} className={containerStyles}>
            <div className="relative flex flex-1 flex-row items-center overflow-hidden">
                <div className="p-1">
                    <Icon name="folder-close" size={24} />
                </div>
                <div className="ml-3 max-h-6 overflow-hidden whitespace-nowrap font-medium text-slate-200 hover:text-gray-800">
                    {title}
                </div>
                <div className="absolute right-0 h-full w-12 bg-gradient-to-r from-transparent to-gray-200" />
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
