import { DivProps } from '@/powerhouse';
import React from 'react';

export interface RWATableHeaderLabelProps extends DivProps {
    readonly label?: React.ReactNode;
}

export const RWATableHeaderLabel: React.FC<
    RWATableHeaderLabelProps
> = props => {
    const { label, ...divProps } = props;

    return (
        <th scope="col" {...divProps}>
            {label}
        </th>
    );
};
