import React from 'react';
import { PressEvent } from 'react-aria-components';

import { ConnectTreeViewItem, ItemStatus, ItemType } from '../tree-view-item';

export interface TreeItem {
    id: string;
    label: string;
    type: ItemType;
    status?: ItemStatus;
    expanded?: boolean;
    children?: TreeItem[];
}

export interface ConnectTreeViewProps
    extends Omit<React.HTMLAttributes<HTMLElement>, 'onClick'> {
    items: TreeItem;
    onItemClick?: (event: PressEvent, item: TreeItem) => void;
    onItemOptionsClick?: (event: PressEvent, item: TreeItem) => void;
}

export const ConnectTreeView: React.FC<ConnectTreeViewProps> = props => {
    const { items, onItemClick, onItemOptionsClick, ...elementProps } = props;

    const renderTreeItems = (item: TreeItem, level = 0) => {
        return (
            <ConnectTreeViewItem
                key={item.id}
                type={item.type}
                label={item.label}
                status={item.status}
                initialOpen={item.expanded}
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
