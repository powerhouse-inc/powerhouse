import {
    TreeItem,
    TreeItemType,
    filterItemsByPath,
    isSubPath,
    useItemsContext,
} from '@/connect';

/**
 * Custom hook that retrieves the content of a specific path in a tree view,
 * filtered by a list of allowed paths.
 *
 * @param path - The path to retrieve the content from.
 * @param allowedPaths - The list of allowed paths to filter the content by.
 * @returns The filtered content of the specified path.
 */
export const usePathContent = (
    path = '',
    allowedPaths = [''],
    allowedTypes: Array<TreeItemType> = [],
) => {
    const { items } = useItemsContext();

    const filterAllowedPaths = (item: TreeItem) => {
        const isAllowedPath = allowedPaths.some(allowedPath => {
            return isSubPath(item.path, allowedPath, true);
        });

        const isAllowedType =
            allowedTypes.length === 0 ? true : allowedTypes.includes(item.type);

        return isAllowedPath && isAllowedType;
    };

    return filterItemsByPath<TreeItem>(items, path, filterAllowedPaths);
};
