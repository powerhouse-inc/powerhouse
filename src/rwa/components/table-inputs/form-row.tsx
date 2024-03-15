import { DivProps, mergeClassNameProps } from '@/powerhouse';
import React from 'react';

export interface RWAFormRowProps extends DivProps {
    label?: React.ReactNode;
    value?: React.ReactNode;
    hideLine?: boolean;
}

export const RWAFormRow: React.FC<RWAFormRowProps> = ({
    label,
    value,
    hideLine = false,
    ...divProps
}) => (
    <div
        {...mergeClassNameProps(
            divProps,
            'flex min-h-12 items-center justify-between px-6 text-xs last:mb-4',
        )}
    >
        <div className="mr-2 min-w-[25%] py-2 text-gray-600">{label}</div>
        {!hideLine && (
            <div className="h-px flex-1 border-b border-dashed border-gray-400" />
        )}
        <div className="mb-1 ml-2 flex min-w-[25%] justify-end py-2 text-gray-900">
            {value ? value : '--'}
        </div>
    </div>
);
