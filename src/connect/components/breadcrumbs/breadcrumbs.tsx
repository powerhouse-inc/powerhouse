import { useState } from 'react';
import { TreeItem } from '..';
import { AddNewItemInput } from './add-new-item-input';

function findDeepestSelectedPath<T extends string = string>(root: TreeItem<T>) {
    let deepestPath: TreeItem<T>[] = [];
    const currentDepth = 0;
    let maxDepth = -1;

    function dfs(node: TreeItem<T>, path: TreeItem<T>[], depth: number) {
        // Add the current node to the path
        path.push(node);

        // If this node is selected and deeper than the previous found, update the deepest path
        if (node.isSelected && depth > maxDepth) {
            maxDepth = depth;
            deepestPath = path.slice(); // Copy the current path
        }

        // Continue to child nodes
        node.children?.forEach(child => {
            dfs(child, path.slice(), depth + 1); // Use a copy of the path for each child
        });
    }

    // Start DFS from the root node
    dfs(root, [], currentDepth);

    return deepestPath;
}

export type BreadcrumbsProps<T extends string> =
    React.HTMLAttributes<HTMLDivElement> & {
        rootItem: TreeItem<T>;
        onItemClick?: (
            event: React.MouseEvent<HTMLDivElement, MouseEvent>,
            item: TreeItem<T>,
        ) => void;
        onNewAddNewItem: (item: TreeItem, option: 'new-folder') => void;
        onSubmitInput: (item: TreeItem) => void;
        onCancelInput: (item: TreeItem) => void;
    };

export function Breadcrumbs<T extends string = string>(
    props: BreadcrumbsProps<T>,
) {
    const [isAddingNewItem, setIsAddingNewItem] = useState(false);
    const breadcrumbItems = findDeepestSelectedPath(props.rootItem);
    const deepestSelectedItem = breadcrumbItems[breadcrumbItems.length - 1];

    if (isAddingNewItem) {
        breadcrumbItems.pop();
    }

    function onAddNew() {
        setIsAddingNewItem(true);
        props.onNewAddNewItem?.(deepestSelectedItem, 'new-folder');
    }
    return (
        <div>
            {breadcrumbItems.map(item => (
                <Breadcrumb
                    key={item.id}
                    item={item}
                    onClick={e => props.onItemClick?.(e, item)}
                />
            ))}
            {isAddingNewItem ? (
                <AddNewItemInput
                    initialValue={deepestSelectedItem.label}
                    placeholder="New Folder"
                    onSubmit={value => {
                        props.onSubmitInput({
                            ...deepestSelectedItem,
                            label: value,
                        });
                        setIsAddingNewItem(false);
                    }}
                    onCancel={() => {
                        props.onCancelInput(deepestSelectedItem);
                        setIsAddingNewItem(false);
                    }}
                />
            ) : (
                <button onClick={onAddNew}>+ Add new</button>
            )}
        </div>
    );
}

export type BreadcrumbProps<T extends string> = {
    onClick?: (
        event: React.MouseEvent<HTMLDivElement, MouseEvent>,
        item: TreeItem<string>,
    ) => void;
    item: TreeItem<T>;
};

export function Breadcrumb<T extends string>(props: BreadcrumbProps<T>) {
    return (
        <>
            <div role="button" onClick={e => props.onClick?.(e, props.item)}>
                {props.item.label}
            </div>
            /
        </>
    );
}
