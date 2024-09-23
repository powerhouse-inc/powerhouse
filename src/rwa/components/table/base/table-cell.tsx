import { Icon } from '@/powerhouse';
import React, { ComponentPropsWithoutRef } from 'react';
import { twMerge } from 'tailwind-merge';

export const RWATableCell: React.FC<ComponentPropsWithoutRef<'td'>> = props => (
    <td
        {...props}
        className={twMerge(
            'truncate border-l border-gray-300 px-3 py-2 text-xs font-medium text-gray-900 first:border-l-0',
            props.className,
        )}
    />
);

export function ItemNumberCell(props: { readonly itemNumber: number }) {
    return <RWATableCell className="w-4">{props.itemNumber}</RWATableCell>;
}

export function MoreDetailsCell(props: {
    readonly isSelected: boolean;
    readonly onClick: () => void;
}) {
    const { isSelected, onClick } = props;

    return (
        <RWATableCell className="w-4">
            <button
                className="flex size-full items-center justify-center"
                onClick={onClick}
            >
                <Icon
                    className={twMerge(
                        'text-gray-600',
                        isSelected && 'rotate-180',
                    )}
                    name="CaretDown"
                    size={16}
                />
            </button>
        </RWATableCell>
    );
}
