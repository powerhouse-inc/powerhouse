import React from 'react';

import {
    ConnectTreeViewItem,
    ConnectTreeViewItemProps,
    TreeItem,
} from '../tree-view-item';

export interface ConnectTreeViewProps
    extends Omit<React.HTMLAttributes<HTMLElement>, 'onClick'> {
    items: TreeItem;
    onDropEvent?: ConnectTreeViewItemProps['onDropEvent'];
    onItemClick?: (
        event: React.MouseEvent<HTMLDivElement, MouseEvent>,
        item: TreeItem,
    ) => void;
    onItemOptionsClick?: (
        event: React.MouseEvent<HTMLDivElement, MouseEvent>,
        item: TreeItem,
    ) => void;
}

export const ConnectTreeView: React.FC<ConnectTreeViewProps> = props => {
    const {
        items,
        onItemClick,
        onDropEvent,
        onItemOptionsClick,
        ...elementProps
    } = props;

    const renderTreeItems = (item: TreeItem, level = 0) => {
        return (
            <ConnectTreeViewItem
                item={item}
                key={item.id}
                onDropEvent={onDropEvent}
                onClick={e => onItemClick?.(e, item)}
                onOptionsClick={e => onItemOptionsClick?.(e, item)}
                {...elementProps}
            >
                {item.children?.map(item => renderTreeItems(item, level + 1))}
            </ConnectTreeViewItem>
        );
    };

    return renderTreeItems(items);
};
