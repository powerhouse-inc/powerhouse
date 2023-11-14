import { useState } from 'react';
import { TreeItem } from '..';
import { AddNewItemInput } from './add-new-item-input';

/**
 * Finds the deepest selected item's path in the TreeView state.
 * We want a linear representation of the path since we only show the path to the deepest selected item and ignore the other children.
 */
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
        onAddNewItem: (item: TreeItem, option: 'new-folder') => void;
        onSubmitInput: (item: TreeItem) => void;
        onCancelInput: (item: TreeItem) => void;
    };

/**
 * The `Breadcrumbs` component displays the current path of the selected item.
 * It also allows the user to add a new folder to the current path.
 * The component mirrors the state and setters of the TreeView, and should be used together with it.
 * The `TreeItem` type is the source of truth.
 */
export function Breadcrumbs<T extends string = string>(
    props: BreadcrumbsProps<T>,
) {
    const [isAddingNewItem, setIsAddingNewItem] = useState(false);
    const breadcrumbItems = findDeepestSelectedPath(props.rootItem);
    const deepestSelectedItem = breadcrumbItems[breadcrumbItems.length - 1];

    // in the case where we are adding a new item, we don't want to show the last item in the breadcrumbs.
    // the new item being added is actually the new deepest selected item, so it would be shown twice otherwise.
    if (isAddingNewItem) {
        breadcrumbItems.pop();
    }

    // adding a new item from the breadcrumbs is a special case of the general add new item functionality found in the TreeView.
    // in this case, we always call the onAddNewItem handler with the deepest selected item and the 'new-folder' option.
    function onAddNew() {
        setIsAddingNewItem(true);
        props.onAddNewItem(deepestSelectedItem, 'new-folder');
    }

    return (
        <div className="p-6 flex flex-row items-center gap-2 text-[#9EA0A1] h-9">
            {breadcrumbItems.map(item => (
                <Breadcrumb
                    key={item.id}
                    item={item}
                    onClick={e => props.onItemClick?.(e, item)}
                    className="last-of-type:text-[#404446] hover:text-[#404446] transition-colors"
                />
            ))}
            {isAddingNewItem ? (
                <AddNewItemInput
                    defaultValue={deepestSelectedItem.label}
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
                <button
                    onClick={onAddNew}
                    className="flex flex-row items-center justify-center gap-2 ml-1 px-2 py-[6px] bg-[#FCFCFC] rounded-[6px] hover:bg-[#EFEFEF] hover:text-[#404446] transition-colors"
                >
                    <svg
                        viewBox="0 0 15 15"
                        fill="currentcolor"
                        className="w-[14px] h-[14px]"
                    >
                        <path d="M7.69559 0.850788C8.17872 0.840217 8.57895 1.22331 8.58952 1.70644L8.70436 6.95519L13.9531 6.84035C14.4362 6.82978 14.8365 7.21286 14.847 7.696C14.8576 8.17913 14.4745 8.57936 13.9914 8.58993L8.74264 8.70477L8.85748 13.9535C8.86805 14.4366 8.48496 14.8369 8.00183 14.8474C7.51869 14.858 7.11847 14.4749 7.1079 13.9918L6.99306 8.74305L1.74431 8.85789C1.26118 8.86846 0.860955 8.48537 0.850384 8.00223C0.839813 7.5191 1.2229 7.11887 1.70603 7.1083L6.95478 6.99347L6.83994 1.74472C6.82937 1.26158 7.21246 0.861359 7.69559 0.850788Z" />
                    </svg>
                    Add new
                </button>
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
    className?: string;
};

export function Breadcrumb<T extends string>(props: BreadcrumbProps<T>) {
    return (
        <>
            <div
                role="button"
                className={props.className}
                onClick={e => props.onClick?.(e, props.item)}
            >
                {props.item.label}
            </div>
            /
        </>
    );
}
