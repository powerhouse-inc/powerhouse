import { DivProps } from '@/powerhouse';
import React from 'react';

export interface SettingsRowProps extends Omit<DivProps, 'title'> {
    title?: React.ReactNode;
    description: React.ReactNode;
}

export const SettingsRow: React.FC<SettingsRowProps> = props => {
    const { title, children, description, ...restProps } = props;

    return (
        <div {...restProps}>
            {title && <h2 className="font-semibold">{title}</h2>}
            <div className="flex items-center justify-between gap-x-12 text-sm font-medium">
                <p>{description}</p>
                <div>{children}</div>
            </div>
        </div>
    );
};
