/**
 * Checks if a given path is the root path or a subpath of a filter path.
 *
 * @param path - The path to check.
 * @param filterPath - The filter path to compare against. Defaults to an empty string.
 * @returns A boolean indicating whether the path is the root path or a subpath of the filter path.
 */
export const isRootPath = (path: string, filterPath = '') => {
    let normalizedFilterPath = filterPath;

    if (filterPath.length > 0) {
        if (!filterPath.endsWith('/')) {
            normalizedFilterPath += '/';
        }

        if (filterPath.startsWith('/')) {
            normalizedFilterPath = normalizedFilterPath.substring(1);
        }
    }

    const regexp = new RegExp(`^/?${normalizedFilterPath}[^/]*/?$`, 'i');
    return regexp.test(path);
};

/**
 * Checks if a path is a sub path of another path.
 *
 * @param path - The path to check.
 * @param filterPath - The path to check against.
 * @param includeRootPath - Whether to include the root path.
 * @returns True if the path is a sub path of the filter path.
 */
export const isSubPath = (
    path: string,
    filterPath = '',
    includeRootPath = false,
) => {
    if (filterPath === '' || filterPath === '/') return true;

    let normalizedFilterPath = filterPath;

    if (normalizedFilterPath.endsWith('/')) {
        normalizedFilterPath = normalizedFilterPath.substring(
            0,
            normalizedFilterPath.length - 1,
        );
    }

    if (normalizedFilterPath.startsWith('/')) {
        normalizedFilterPath = normalizedFilterPath.substring(1);
    }

    const regexpStr = includeRootPath
        ? `^/?${normalizedFilterPath}(/.*)?$`
        : `^/?${normalizedFilterPath}/.+$`;
    const regexp = new RegExp(regexpStr, 'i');

    return regexp.test(path);
};

/**
 * Filters items by path.
 *
 * @param items - The items to filter.
 * @param filterPath - The path to filter by.
 * @param customFilter - A custom filter function.
 * @returns The filtered items.
 */

type CustomFilterType<T> = (item: T) => boolean;
export const filterItemsByPath = <T extends { path: string }>(
    items: Array<T>,
    filterPath = '',
    customFilter: CustomFilterType<T> = () => true,
): Array<T> =>
    items.filter(
        item => isRootPath(item.path, filterPath) && customFilter(item),
    );

/**
 * Returns the root path of a given path.
 *
 * @param path - The path to extract the root path from.
 * @returns The root path.
 */
export const getRootPath = (path: string) => {
    if (path.length > 0 && path.startsWith('/')) {
        path = path.substring(1);
    }

    const rootPath = path.split('/')[0];
    return rootPath === '' ? '/' : rootPath;
};
