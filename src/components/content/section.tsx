import { DivProps } from '@powerhousedao/design-system';
import React from 'react';

export interface ContentSection extends DivProps {
    title?: string;
    children?: React.ReactNode;
}

export const ContentSection: React.FC<ContentSection> = ({
    title,
    children,
    ...divProps
}) => {
    return (
        <div {...divProps}>
            {title && (
                <div className="mb-4 text-base font-semibold text-[#6C7275]">
                    {title}
                </div>
            )}
            <div className="flex flex-wrap gap-2">{children}</div>
        </div>
    );
};
