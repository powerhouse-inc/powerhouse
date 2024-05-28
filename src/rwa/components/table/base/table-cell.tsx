import { Icon, mergeClassNameProps } from '@/powerhouse';
import React, { ComponentPropsWithoutRef } from 'react';
import { twMerge } from 'tailwind-merge';

export const RWATableCell: React.FC<ComponentPropsWithoutRef<'td'>> = props => (
    <td
        {...mergeClassNameProps(
            props,
            'truncate px-3 py-2 text-xs font-medium text-gray-900',
        )}
    />
);

export function ItemNumberCell(props: { itemNumber: number }) {
    return <RWATableCell className="w-4">{props.itemNumber}</RWATableCell>;
}

export function MoreDetailsCell(props: {
    isSelected: boolean;
    onClick: () => void;
}) {
    const { isSelected, onClick } = props;

    return (
        <RWATableCell className="w-4">
            <button
                className="flex size-full items-center justify-center"
                onClick={onClick}
            >
                <Icon
                    name="caret-down"
                    size={16}
                    className={twMerge(
                        'text-gray-600',
                        isSelected && 'rotate-180',
                    )}
                />
            </button>
        </RWATableCell>
    );
}
