import { DivProps, mergeClassNameProps } from '@/powerhouse';
import React from 'react';
import {
    Column,
    ColumnProps,
    Table,
    TableBody,
    TableBodyProps,
    TableHeader,
    TableHeaderProps,
    TableProps,
} from 'react-aria-components';
import { RWATableHeaderLabel } from './header-label';

export type RWAColumnHeader = {
    id: React.Key;
    label?: React.ReactNode;
    props?: ColumnProps;
};

export interface RWATableProps<T extends object> extends DivProps {
    header: RWAColumnHeader[];
    items?: T[];
    renderRow?: (item: T, index: number) => JSX.Element;
    children?: React.ReactNode;
    tableProps?: TableProps;
    tableHeaderProps?: TableHeaderProps<RWAColumnHeader>;
    tableBodyProps?: TableBodyProps<T>;
    columnProps?: ColumnProps;
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
    const {
        children,
        header,
        items,
        renderRow,
        tableProps = {},
        tableHeaderProps = {},
        tableBodyProps = {},
        columnProps = {},
        ...containerProps
    } = props;

    return (
        <div
            {...mergeClassNameProps(
                containerProps,
                'relative inline-block max-h-[280px] overflow-auto rounded-lg border border-gray-300',
            )}
            ref={ref}
        >
            <Table
                onSortChange={d => console.log(d)}
                {...tableProps}
                {...mergeClassNameProps(tableProps, 'table-fixed')}
            >
                <TableHeader
                    {...mergeClassNameProps(
                        tableHeaderProps,
                        'sticky top-0 z-10 border-b border-gray-300 bg-gray-100 [&>tr>th:last-child]:border-l [&>tr>th:last-child]:border-gray-300 text-nowrap',
                    )}
                >
                    {header.map(
                        ({ id, label, props: colProps = {} }, index) => (
                            <Column
                                allowsSorting
                                id={id as string}
                                {...(index === 0 && { isRowHeader: true })}
                                {...mergeClassNameProps(
                                    { ...columnProps, ...colProps },
                                    'p-3 text-xs font-medium text-gray-600 outline-none cursor-pointer',
                                )}
                                key={id}
                            >
                                {colProps.allowsSorting ?? true ? (
                                    <RWATableHeaderLabel
                                        label={label}
                                        {...(tableProps.sortDescriptor
                                            ?.column === id && {
                                            sortDirection:
                                                tableProps.sortDescriptor
                                                    .direction,
                                        })}
                                    />
                                ) : (
                                    label
                                )}
                            </Column>
                        ),
                    )}
                </TableHeader>
                <TableBody {...tableBodyProps}>
                    {children}
                    {items &&
                        renderRow &&
                        items.map((item, index) => renderRow(item, index))}
                </TableBody>
            </Table>
        </div>
    );
});
