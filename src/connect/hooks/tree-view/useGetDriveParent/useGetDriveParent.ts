import { useItemsContext } from '@/connect/context/ItemsContext';
import { getRootPath } from '@/connect/utils/path';

/**
 * Custom hook to get the parent drive item based on the given path.
 * @returns {Function} A function that takes a path as input and returns the parent drive item.
 */
export const useGetDriveParent = () => {
    const { items } = useItemsContext();
    
    const getDriveParent = (path: string) => {
        const rootPath = getRootPath(path);

        const regexp = new RegExp(`^/?${rootPath}/?$`, 'i');
        const driveParent = items.find(item => regexp.test(item.path));

        return driveParent;
    };

    return getDriveParent;
};

export default useGetDriveParent;
