import { useItemsContext } from '@/connect';

export const useGetItemByPath = () => {
    const { items } = useItemsContext();

    const getItemByPath = (path: string) => {
        return items.find(item => item.path === path);
    };

    return getItemByPath;
};
