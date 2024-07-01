import { decodeID, useItemsContext } from '@powerhousedao/design-system';

export const useGetReadableItemPath = () => {
    const { items } = useItemsContext();

    return (itemId: string) => {
        const filteredItem = items.find(item => item.id === itemId);
        if (!filteredItem) return '';

        const pathSegments = filteredItem.path.split('/');
        const pathNames = pathSegments.map(segmentId => {
            const decodedSegmentId = decodeID(segmentId);
            const segmentItem = items.find(
                item => item.id === decodedSegmentId,
            );

            if (!segmentItem) return '';

            return segmentItem.label;
        });

        return pathNames.join('/');
    };
};
