import { TreeItem, useItemsContext } from '@/connect';
import { GetPathContentOptions, getPathContent } from '../utils';

type FilterFunction = (
    value: TreeItem,
    index: number,
    array: TreeItem[],
) => boolean;

export const useFilterPathContent = () => {
    const { items } = useItemsContext();

    const filterPathContent = (
        filter: FilterFunction,
        options?: Omit<GetPathContentOptions, 'items'>,
    ) => {
        const pathItems = getPathContent({
            items,
            ...options,
        });

        return pathItems.filter(filter);
    };

    return filterPathContent;
};
