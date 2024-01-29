import { DivProps, Icon, mergeClassNameProps } from '@/powerhouse';
import React from 'react';
import { SortDirection } from 'react-aria-components';
import { twMerge } from 'tailwind-merge';

export interface RWATableHeaderLabelProps extends DivProps {
    label?: React.ReactNode;
    sortDirection?: SortDirection;
}

export const RWATableHeaderLabel: React.FC<
    RWATableHeaderLabelProps
> = props => {
    const { label, sortDirection, ...divProps } = props;

    return (
        <div
            {...mergeClassNameProps(
                divProps,
                'flex items-center hover:text-gray-900 group',
            )}
        >
            <div>{label}</div>
            <Icon
                name="arrow-filled-right"
                size={6}
                className={twMerge(
                    'invisible ml-1 rotate-90',
                    sortDirection && 'group-hover:visible',
                    sortDirection === 'ascending' && 'rotate-[270deg]',
                )}
            />
        </div>
    );
};
