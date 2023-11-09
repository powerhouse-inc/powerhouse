import React from 'react';

import {
    ConnectTreeViewItem,
    ConnectTreeViewItemProps,
    TreeItem,
} from '../tree-view-item';

export interface ConnectTreeViewProps<T extends string = string>
    extends Omit<React.HTMLAttributes<HTMLElement>, 'onClick'> {
    items: TreeItem<T>;
    onDropEvent?: ConnectTreeViewItemProps<T>['onDropEvent'];
    onItemClick?: (
        event: React.MouseEvent<HTMLDivElement, MouseEvent>,
        item: TreeItem<T>,
    ) => void;
    onItemOptionsClick?: ConnectTreeViewItemProps<T>['onOptionsClick'];
    defaultItemOptions?: ConnectTreeViewItemProps<T>['defaultOptions'];
}

export function ConnectTreeView<T extends string = string>(
    props: ConnectTreeViewProps<T>,
) {
    const {
        items,
        onItemClick,
        onDropEvent,
        defaultItemOptions,
        onItemOptionsClick,
        ...elementProps
    } = props;

    function renderTreeItems(item: TreeItem<T>, level = 0) {
        return (
            <ConnectTreeViewItem<T>
                item={item}
                key={item.id}
                onDropEvent={onDropEvent}
                onOptionsClick={onItemOptionsClick}
                defaultOptions={defaultItemOptions}
                onClick={e => onItemClick?.(e, item)}
                disableDropBetween={level === 0 && !item.expanded}
                {...elementProps}
            >
                {item.children?.map(item => renderTreeItems(item, level + 1))}
            </ConnectTreeViewItem>
        );
    }

    return renderTreeItems(items);
}
