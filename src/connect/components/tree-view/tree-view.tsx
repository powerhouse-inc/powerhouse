import React from 'react';

import { usePathContent } from '../../hooks/tree-view/usePathContent';
import {
    ConnectTreeViewInput,
    ConnectTreeViewInputProps,
} from '../tree-view-input';
import {
    ActionType,
    ConnectTreeViewItem,
    ConnectTreeViewItemProps,
    TreeItem,
} from '../tree-view-item';

export interface ConnectTreeViewProps
    extends Omit<
        React.HTMLAttributes<HTMLElement>,
        'onClick' | 'onDragStart' | 'onDragEnd'
    > {
    onDropEvent?: ConnectTreeViewItemProps['onDropEvent'];
    onItemClick?: (
        event: React.MouseEvent<HTMLDivElement>,
        item: TreeItem,
    ) => void;
    onItemOptionsClick?: ConnectTreeViewItemProps['onOptionsClick'];
    defaultItemOptions?: ConnectTreeViewItemProps['defaultOptions'];
    onSubmitInput?: ConnectTreeViewInputProps['onSubmit'];
    onCancelInput?: ConnectTreeViewInputProps['onCancel'];
    onDropActivate?: ConnectTreeViewItemProps['onDropActivate'];
    onDragStart?: ConnectTreeViewItemProps['onDragStart'];
    onDragEnd?: ConnectTreeViewItemProps['onDragEnd'];
    disableHighlightStyles?: boolean;
    filterPath?: string;
    level?: number;
    allowedPaths?: string[];
}

export function ConnectTreeView(props: ConnectTreeViewProps) {
    const {
        onItemClick,
        onDropEvent,
        defaultItemOptions,
        onItemOptionsClick,
        onSubmitInput = () => {},
        onCancelInput = () => {},
        filterPath,
        level = 0,
        allowedPaths,
        ...elementProps
    } = props;

    const items = usePathContent(filterPath, allowedPaths);

    return (
        <>
            {items.map(item => {
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
                    <ConnectTreeViewItem
                        item={item}
                        level={level}
                        key={item.id}
                        onDropEvent={onDropEvent}
                        onOptionsClick={onItemOptionsClick}
                        defaultOptions={defaultItemOptions}
                        onClick={e => onItemClick?.(e, item)}
                        disableDropBetween={level === 0 && !item.expanded}
                        {...elementProps}
                    >
                        {item.expanded && (
                            <ConnectTreeView
                                {...props}
                                level={level + 1}
                                filterPath={item.path}
                            />
                        )}
                    </ConnectTreeViewItem>
                );
            })}
        </>
    );
}
