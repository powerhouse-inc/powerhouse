import { renderHook } from '@testing-library/react';
import { treeItems } from '../mocks';
import { useGetPathContent } from './useGetPathContent';

const setItems = vi.fn();

vi.mock('../../../context/ItemsContext', () => ({
    useItemsContext: () => ({ items: treeItems, setItems }),
}));

describe('TreeView hooks', () => {
    describe('useGetPathContent', () => {
        it('should return the root items of an specific path', () => {
            const { result } = renderHook(() => useGetPathContent());
            const getPathContent = result.current;

            const pathContent = getPathContent({ path: 'drive/folder1' });

            expect(pathContent.length).toBe(2);
            expect(pathContent[0].label).toBe('Folder 1.1');
            expect(pathContent[1].label).toBe('Folder 1.2');
        });

        it('should return an empty array if the path does not exist', () => {
            const { result } = renderHook(() => useGetPathContent());
            const getPathContent = result.current;

            const pathContent = getPathContent({ path: 'drive/folder4' });

            expect(pathContent.length).toBe(0);
        });

        it('should should use root path if path is not provided', () => {
            const { result } = renderHook(() => useGetPathContent());
            const getPathContent = result.current;

            const pathContent = getPathContent();

            expect(pathContent.length).toBe(1);
            expect(pathContent[0].label).toBe('Local Drive');
        });

        it('should return all items if path is "*"', () => {
            const { result } = renderHook(() => useGetPathContent());
            const getPathContent = result.current;

            const pathContent = getPathContent({ path: '*' });

            expect(pathContent.length).toBe(treeItems.length);
        });
    });
});
