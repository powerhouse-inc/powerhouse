import {
    TreeItem,
    TreeItemType,
    filterItemsByPath,
    isSubPath,
} from '@/connect';

export interface GetPathContentOptions {
    path?: string;
    allowedPaths?: string[];
    allowedTypes?: TreeItemType[];
    items: TreeItem[];
}

export const getPathContent = (options: GetPathContentOptions) => {
    const {
        items,
        path = '',
        allowedTypes = [],
        allowedPaths = [''],
    } = options;

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
