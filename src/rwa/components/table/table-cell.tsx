import { mergeClassNameProps } from '@/powerhouse';
import React, { ComponentPropsWithoutRef } from 'react';

export const RWATableCell: React.FC<ComponentPropsWithoutRef<'td'>> = props => (
    <td
        {...mergeClassNameProps(
            props,
            'truncate px-3 py-2 text-xs font-medium text-gray-900',
        )}
    />
);
