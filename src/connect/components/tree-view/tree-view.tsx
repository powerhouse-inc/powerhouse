import React from 'react';

import {
    ActionType,
    ConnectTreeViewItem,
    ConnectTreeViewItemProps,
    TreeItem,
} from '../tree-view-item';

import {
    ConnectTreeViewInput,
    ConnectTreeViewInputProps,
} from '../tree-view-input';

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
    onSubmitInput?: ConnectTreeViewInputProps['onSubmit'];
    onCancelInput?: ConnectTreeViewInputProps['onCancel'];
    onDropActivate?: ConnectTreeViewItemProps<T>['onDropActivate'];
    onDragStart?: ConnectTreeViewItemProps<T>['onDragStart'];
    onDragEnd?: ConnectTreeViewItemProps<T>['onDragEnd'];
    disableHighlightStyles?: boolean;
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
        onSubmitInput = () => {},
        onCancelInput = () => {},
        ...elementProps
    } = props;

    function renderTreeItems(item: TreeItem<T>, level = 0) {
        if (
            item.action === ActionType.New ||
            item.action === ActionType.Update
        ) {
            return (
                <ConnectTreeViewInput
                    item={item}
                    key={item.id}
                    level={level}
                    onSubmit={onSubmitInput}
                    onCancel={onCancelInput}
                />
            );
        }

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
