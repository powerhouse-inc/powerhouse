import { useItemsContext } from '@/connect/context/ItemsContext';

/**
 * Returns a function that retrieves an item from the items array by its ID.
 * @returns {Function} A function that takes an item ID as a parameter and returns the corresponding item.
 */
export const useGetItemById = () => {
    const { items } = useItemsContext();

    return (itemId: string) => items.find(item => item.id === itemId);
};
