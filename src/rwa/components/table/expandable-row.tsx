import { mergeClassNameProps } from '@/powerhouse';
import { ComponentPropsWithRef } from 'react';
import { twMerge } from 'tailwind-merge';

export interface RWATableRowProps extends ComponentPropsWithRef<'tr'> {
    children: React.ReactNode;
    isExpanded?: boolean;
    accordionContent: React.ReactNode;
    tdProps?: ComponentPropsWithRef<'td'>;
}

export const RWATableRow: React.FC<RWATableRowProps> = props => {
    const {
        children,
        accordionContent,
        isExpanded = false,
        tdProps = {},
        ...trProps
    } = props;

    return (
        <>
            {children}
            <tr
                {...mergeClassNameProps(
                    trProps,
                    twMerge('collapse', isExpanded && 'visible'),
                )}
            >
                <td {...tdProps}>{accordionContent}</td>
            </tr>
        </>
    );
};
