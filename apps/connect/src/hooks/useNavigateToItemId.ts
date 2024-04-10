import { useLocation, useNavigate } from 'react-router-dom';
import { useGetReadableItemPath } from './useGetReadableItemPath';

export const useNavigateToItemId = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const getReadableItemPath = useGetReadableItemPath();

    return (id: string) => {
        const itemPath = getReadableItemPath(id);
        const fullPath = `/d/${encodeURI(itemPath)}`;
        navigate({ pathname: fullPath, search: location.search });
    };
};
