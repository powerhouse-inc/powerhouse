import { renderHook } from '@testing-library/react';
import { treeItems } from '../mocks';
import { useGetItemById } from './useGetItemById';

/* eslint-disable */
const setItems = vi.fn();

vi.mock('../../../context/ItemsContext', () => ({
    useItemsContext: () => ({ items: treeItems, setItems }),
}));

describe('TreeView hooks', () => {
    describe('useGetItemById', () => {
        it('should return item if ID exists', () => {
            const { result } = renderHook(() => useGetItemById());
            const getItemById = result.current;

            const item = getItemById('drive/folder1/folder1.2');

            expect(item).toEqual({
                id: 'drive/folder1/folder1.2',
                path: 'drive/folder1/folder1.2',
                label: 'Folder 1.2',
                type: 'FOLDER',
                status: 'SYNCING',
                expanded: false,
                isSelected: false,
            });
        });

        it('should return undefined if ID does not exist', () => {
            const { result } = renderHook(() => useGetItemById());
            const getItemById = result.current;

            const item = getItemById('drive/folder1/some-random-id');

            expect(item).toBeUndefined();
        });
    });
});
