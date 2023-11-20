import { TreeItem } from '@/connect/components/tree-view-item';
import { useItemsContext } from '@/connect/context/ItemsContext';
import { filterItemsByPath, isSubPath } from '@/connect/utils/path';

/**
 * Custom hook that retrieves the content of a specific path in a tree view,
 * filtered by a list of allowed paths.
 *
 * @param path - The path to retrieve the content from.
 * @param allowedPaths - The list of allowed paths to filter the content by.
 * @returns The filtered content of the specified path.
 */
export const usePathContent = (path = '', allowedPaths = ['']) => {
    const { items } = useItemsContext();

    const filterAllowedPaths = (item: TreeItem) => {
        return allowedPaths.some(allowedPath => {
            return isSubPath(item.path, allowedPath, true);
        });
    };

    return filterItemsByPath<TreeItem>(items, path, filterAllowedPaths);
};

export default usePathContent;
