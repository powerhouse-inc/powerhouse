import { mergeClassNameProps } from '@/powerhouse';
import React from 'react';
import { Cell, CellProps } from 'react-aria-components';

export const RWATableCell: React.FC<CellProps> = props => (
    <Cell
        {...mergeClassNameProps(
            props,
            'text-xs text-gray-900 font-medium px-3 py-2 truncate',
        )}
    />
);
