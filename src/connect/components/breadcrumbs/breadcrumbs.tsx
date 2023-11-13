import { TreeItem } from '..';

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
    };

export function Breadcrumbs<T extends string = string>(
    props: BreadcrumbsProps<T>,
) {
    const breadcrumbItems = findDeepestSelectedPath(props.rootItem);
    return breadcrumbItems.map(item => (
        <Breadcrumb
            key={item.id}
            item={item}
            onClick={e => props.onItemClick?.(e, item)}
        />
    ));
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
