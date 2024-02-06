import { DivProps, mergeClassNameProps } from '@/powerhouse';
import React from 'react';

export type RWAColumnHeader = {
    id: React.Key;
    label?: React.ReactNode;
};

export interface RWATableProps<T extends object> extends DivProps {
    header: RWAColumnHeader[];
    items?: T[];
    renderRow?: (item: T, index: number) => JSX.Element;
    children?: React.ReactNode;
}

/** Allows using forward ref with generics.
 * @see: https://www.totaltypescript.com/forwardref-with-generic-components
 */
// eslint-disable-next-line @typescript-eslint/ban-types
function fixedForwardRef<T, P = {}>(
    render: (props: P, ref: React.Ref<T>) => React.ReactNode,
): (props: P & React.RefAttributes<T>) => React.ReactNode {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
    return React.forwardRef(render) as any;
}

export const RWATable = fixedForwardRef(function RWATable<T extends object>(
    props: RWATableProps<T>,
    ref: React.ForwardedRef<HTMLDivElement>,
) {
    const { children, header, items, renderRow, ...containerProps } = props;

    return (
        <div
            {...mergeClassNameProps(
                containerProps,
                'relative inline block max-h-[280px] overflow-auto rounded-lg border border-gray-300',
            )}
            ref={ref}
        >
            <table className="w-full">
                <thead className="sticky top-0 z-10 text-nowrap border-b border-gray-300 bg-gray-100">
                    <tr>
                        {header.map(({ id, label }) => (
                            <th
                                className="border-l border-gray-300 p-3 text-start text-xs font-medium text-gray-900 first:border-l-0"
                                key={id}
                            >
                                {label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {children}
                    {items &&
                        renderRow &&
                        items.map((item, index) => renderRow(item, index))}
                </tbody>
            </table>
        </div>
    );
});
