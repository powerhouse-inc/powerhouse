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
    onItemOptionsClick?: ConnectTreeViewItemProps['onOptionsClick'];
    defaultItemOptions?: ConnectTreeViewItemProps['defaultOptions'];
}

export const ConnectTreeView: React.FC<ConnectTreeViewProps> = props => {
    const {
        items,
        onItemClick,
        onDropEvent,
        defaultItemOptions,
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
                onOptionsClick={onItemOptionsClick}
                defaultOptions={defaultItemOptions}
                {...elementProps}
            >
                {item.children?.map(item => renderTreeItems(item, level + 1))}
            </ConnectTreeViewItem>
        );
    };

    return renderTreeItems(items);
};
