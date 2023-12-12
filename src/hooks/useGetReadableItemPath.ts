import { useFilterPathContent } from '@powerhousedao/design-system';

export const useGetReadableItemPath = () => {
    const filterPathContent = useFilterPathContent();

    return (itemId: string) => {
        const filteredItems = filterPathContent(
            item => {
                return item.id === itemId;
            },
            { path: '*' }
        );

        if (filteredItems.length === 0) return '';
        const [item] = filteredItems;

        const pathSegments = item.path.split('/');
        const pathNames = pathSegments.map(segmentId => {
            const filteredItems = filterPathContent(
                item => item.id === segmentId,
                { path: '*' }
            );

            if (filteredItems.length === 0) return '';
            const [item] = filteredItems;

            return item.label;
        });

        return pathNames.join('/');
    };
};
