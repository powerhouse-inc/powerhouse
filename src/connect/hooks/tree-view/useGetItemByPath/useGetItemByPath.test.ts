import { renderHook } from '@testing-library/react';
import { treeItems } from '../mocks';
import { useGetItemByPath } from './useGetItemByPath';

/* eslint-disable */
const setItems = vi.fn();

vi.mock('../../../context/ItemsContext', () => ({
    useItemsContext: () => ({ items: treeItems, setItems }),
}));

describe('TreeView hooks', () => {
    describe('useGetItemByPath', () => {
        it('should return the TreeItem when is found', () => {
            const { result } = renderHook(() => useGetItemByPath());
            const getItemByPath = result.current;

            expect(getItemByPath(treeItems[4].path)).toEqual(treeItems[4]);
        });

        it('should return undefined when the TreeItem is not found', () => {
            const { result } = renderHook(() => useGetItemByPath());
            const getItemByPath = result.current;

            expect(getItemByPath('not-found-path')).toBeUndefined();
        });
    });
});
