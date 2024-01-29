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
    items: T[];
    renderRow: (item: T, index: number) => JSX.Element;
    tableProps?: TableProps;
    tableHeaderProps?: TableHeaderProps<RWAColumnHeader>;
    tableBodyProps?: TableBodyProps<T>;
    columnProps?: ColumnProps;
}

export function RWATable<T extends object>(props: RWATableProps<T>) {
    const {
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
        >
            <Table onSortChange={d => console.log(d)} {...tableProps}>
                <TableHeader
                    {...mergeClassNameProps(
                        tableHeaderProps,
                        'sticky top-0 z-10 border-b border-gray-300 bg-gray-100 [&>tr>th:last-child]:border-l [&>tr>th:last-child]:border-gray-300',
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
                    {items.map((item, index) => renderRow(item, index))}
                </TableBody>
            </Table>
        </div>
    );
}
