import { useItemsContext } from '@/connect';
import {
    GetPathContentOptions,
    getPathContent as getPathContentUtil,
} from '../utils';

export const useGetPathContent = () => {
    const { items } = useItemsContext();

    const getPathContent = (options?: Omit<GetPathContentOptions, 'items'>) => {
        return getPathContentUtil({
            items,
            ...options,
        });
    };

    return getPathContent;
};
