import { mergeClassNameProps } from '@/powerhouse';
import React, { ComponentPropsWithoutRef } from 'react';

export const RWATableCell: React.FC<ComponentPropsWithoutRef<'td'>> = props => (
    <td
        {...mergeClassNameProps(
            props,
            'text-xs text-gray-900 font-medium px-3 py-2 truncate',
        )}
    />
);
