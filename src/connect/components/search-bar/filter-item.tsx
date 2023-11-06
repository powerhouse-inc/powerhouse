import { mergeClassNameProps } from '@/powerhouse/utils';
import React from 'react';

export type FilterItemType = {
    id: string;
    label: string;
    icon?: string;
};

export interface FilterItemProps extends React.HTMLAttributes<HTMLDivElement> {
    item: FilterItemType;
}

export const FilterItem: React.FC<FilterItemProps> = props => {
    const { item, ...containerProps } = props;

    return (
        <div
            {...mergeClassNameProps(
                containerProps,
                'flex flex-row h-full items-center gap-x-4 justify-between px-2',
            )}
        >
            <div className="flex items-center justify-center w-4 h-4">
                {item.icon && <img src={item.icon} />}
            </div>
            <div className="text-sm text-[#6C7275] font-semibold">
                {item.label}
            </div>
        </div>
    );
};
