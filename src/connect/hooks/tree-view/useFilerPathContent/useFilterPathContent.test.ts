import { TreeItem } from '@/connect';
import { renderHook } from '@testing-library/react';
import { treeItems } from '../mocks';
import { useFilterPathContent } from './useFilterPathContent';

const setItems = vi.fn();

vi.mock('../../../context/ItemsContext', () => ({
    useItemsContext: () => ({ items: treeItems, setItems }),
}));

describe('TreeView hooks', () => {
    describe('useFilterPathContent', () => {
        it('should return the items that match the filter fn in a specific path', () => {
            const { result } = renderHook(() => useFilterPathContent());
            const filterPathContent = result.current;

            const filterFn = (item: TreeItem) => item.label === 'Folder 1.2';
            const filteredItems = filterPathContent(filterFn, {
                path: 'drive/folder1',
            });

            expect(filteredItems.length).toBe(1);
            expect(filteredItems[0].label).toBe('Folder 1.2');
        });

        it('should return an empty array if no items match the filter fn in a specific path', () => {
            const { result } = renderHook(() => useFilterPathContent());
            const filterPathContent = result.current;

            const filterFn = (item: TreeItem) => item.label === 'Folder 1.3';
            const filteredItems = filterPathContent(filterFn, {
                path: 'drive/folder1',
            });

            expect(filteredItems.length).toBe(0);
        });

        it('should return an empty array if the path does not exist', () => {
            const { result } = renderHook(() => useFilterPathContent());
            const filterPathContent = result.current;

            const filterFn = (item: TreeItem) => item.label === 'Folder 1.2';
            const filteredItems = filterPathContent(filterFn, {
                path: 'drive/folder4',
            });

            expect(filteredItems.length).toBe(0);
        });

        it('should use root drive path if path option is not provided', () => {
            const { result } = renderHook(() => useFilterPathContent());
            const filterPathContent = result.current;

            const filterFn = (item: TreeItem) => item.label === 'Local Drive';
            const filteredItems = filterPathContent(filterFn);

            expect(filteredItems.length).toBe(1);
        });

        it('should run filter function against all items when filter path is "*"', () => {
            const { result } = renderHook(() => useFilterPathContent());
            const filterPathContent = result.current;

            const filterFn = (item: TreeItem) => item.label === 'Folder 1.2.1';
            const filteredItems = filterPathContent(filterFn, { path: '*' });

            expect(filteredItems.length).toBe(1);
        });
    });
});
