import { Icon } from '@/powerhouse';
import {
    TreeViewInput,
    TreeViewInputProps,
} from '@/powerhouse/components/tree-view-input';
import React from 'react';
import { twMerge } from 'tailwind-merge';
import { TreeItem } from '../tree-view-item';

export interface ConnectTreeViewInputProps
    extends Omit<
        TreeViewInputProps,
        | 'initialValue'
        | 'onSubmit'
        | 'onCancel'
        | 'submitIcon'
        | 'cancelIcon'
        | 'icon'
    > {
    item: TreeItem;
    onSubmit: (item: TreeItem) => void;
    onCancel: (item: TreeItem) => void;
}

export const ConnectTreeViewInput: React.FC<
    ConnectTreeViewInputProps
> = props => {
    const { className, item, onSubmit, onCancel, ...restProps } = props;

    return (
        <TreeViewInput
            icon={<Icon name="folder-close" color="#6C7275" />}
            submitIcon={
                <Icon
                    name="check"
                    className="transition-colors hover:text-[#34A853]"
                />
            }
            cancelIcon={
                <Icon
                    name="xmark"
                    className="transition-colors hover:text-[#EA4335]"
                />
            }
            className={twMerge('h-12 rounded-lg bg-[#F1F5F9]', className)}
            initialValue={item.label}
            onSubmit={value => onSubmit({ ...item, label: value })}
            onCancel={() => onCancel(item)}
            {...restProps}
        />
    );
};
