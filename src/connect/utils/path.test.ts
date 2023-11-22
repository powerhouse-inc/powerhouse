import { filterItemsByPath, getRootPath, isRootPath, isSubPath } from './path';

describe('Utils', () => {
    describe('isRootPath', () => {
        it('should return true if path is root', () => {
            expect(isRootPath('/')).toBe(true);
            expect(isRootPath('/root')).toBe(true);
            expect(isRootPath('root')).toBe(true);
            expect(isRootPath('')).toBe(true);
        });

        it('should return false if path is not root', () => {
            expect(isRootPath('/root/sub')).toBe(false);
            expect(isRootPath('/root/sub/sub')).toBe(false);
            expect(isRootPath('root/sub')).toBe(false);
            expect(isRootPath('root/sub/sub')).toBe(false);
        });

        it('should return true if path is at the root of filterPath', () => {
            expect(isRootPath('/root/sub', 'root')).toBe(true);
            expect(isRootPath('/root/sub', '/root')).toBe(true);
            expect(isRootPath('/root/sub', 'root/')).toBe(true);
            expect(isRootPath('/root/sub', '/root/')).toBe(true);
            expect(
                isRootPath(
                    '/documents/budget/2021/file',
                    '/documents/budget/2021',
                ),
            ).toBe(true);
        });

        it('should return false if path is not at the root of filterPath', () => {
            expect(isRootPath('/root/sub/sub', 'root')).toBe(false);
            expect(isRootPath('/root/sub/sub', '/root')).toBe(false);
            expect(isRootPath('/root/sub/sub', 'root/')).toBe(false);
            expect(isRootPath('/root/sub/sub', '/root/')).toBe(false);
            expect(
                isRootPath(
                    '/documents/budget/2021/drafts/file',
                    '/documents/budget/2021',
                ),
            ).toBe(false);
        });
    });

    describe('filterItemsByPath', () => {
        it('should return items at the root of filterPath', () => {
            const filterPath = '/root/sub';
            const validPaths = [
                { path: '/root/sub/file1' },
                { path: '/root/sub/file2' },
                { path: '/root/sub/file3' },
            ];

            const items = [
                ...validPaths,
                { path: '/root/sub/budget/file4' },
                { path: '/root/2021/file5' },
                { path: '/root/sub' },
                { path: '/root' },
            ];

            const filteredItems = filterItemsByPath(items, filterPath);

            expect(filteredItems).toHaveLength(validPaths.length);
            expect(filteredItems).toEqual(validPaths);
        });

        it("should return an empty array when there's no match with the filterPath", () => {
            const filterPath = '/root/sub';
            const items = [
                { path: '/root/2021/file1' },
                { path: '/root/2021/file2' },
                { path: '/root/2021/file3' },
            ];

            const filteredItems = filterItemsByPath(items, filterPath);

            expect(filteredItems).toHaveLength(0);
        });

        it('should return all root items when filterPath is empty', () => {
            const validItems = [{ path: '/root' }, { path: '/budget' }];
            const items = [
                { path: '/root/file1' },
                { path: '/root/file2' },
                { path: '/root/file3' },
                { path: '/budget/2021' },
                { path: '/budget/2021/file4' },
                ...validItems,
            ];

            const filteredItems = filterItemsByPath(items);

            expect(filteredItems).toHaveLength(validItems.length);
            expect(filteredItems).toEqual(validItems);
        });
    });

    describe('isSubPath', () => {
        it('should return true if path is subpath', () => {
            expect(isSubPath('/root/sub', 'root')).toBe(true);
            expect(isSubPath('/root/sub', '/root')).toBe(true);
            expect(isSubPath('/root/sub/file', 'root/')).toBe(true);
            expect(isSubPath('root/sub/folder', '/root/')).toBe(true);
            expect(isSubPath('root/sub/folder', '/')).toBe(true);
            expect(isSubPath('root/sub/folder', '')).toBe(true);
            expect(
                isSubPath(
                    '/documents/budget/2021/file',
                    '/documents/budget/2021',
                ),
            ).toBe(true);

            expect(isSubPath('drive', 'drive')).toBe(false);
            expect(isSubPath('drive', '/drive')).toBe(false);
            expect(isSubPath('drive', '/drive/')).toBe(false);
            expect(isSubPath('/drive', 'drive')).toBe(false);
            expect(isSubPath('/drive/', 'drive')).toBe(false);
            expect(isSubPath('/drive/', '/drive')).toBe(false);
            expect(isSubPath('drive/', 'drive')).toBe(false);
        });

        it('should return false if path is not subpath', () => {
            expect(isSubPath('drive', 'root')).toBe(false);
            expect(isSubPath('/root/sub', 'root/sub')).toBe(false);
            expect(isSubPath('root/sub', '/root/sub')).toBe(false);
            expect(isSubPath('/root/folder/file', 'root/sub')).toBe(false);
            expect(isSubPath('root/sub/folder', '/root/sub/folder')).toBe(
                false,
            );
        });

        it('should return true if path is the same as filterPath when includeRootPath is true', () => {
            expect(isSubPath('/root/sub', 'root', true)).toBe(true);
            expect(isSubPath('/root/sub', '/root', true)).toBe(true);
            expect(isSubPath('/root/sub/file', 'root/', true)).toBe(true);
            expect(isSubPath('root/sub/folder', '/root/', true)).toBe(true);
            expect(isSubPath('root/sub/folder', '/', true)).toBe(true);
            expect(isSubPath('root/sub/folder', '', true)).toBe(true);
            expect(
                isSubPath(
                    '/documents/budget/2021/file',
                    '/documents/budget/2021',
                    true,
                ),
            ).toBe(true);
            expect(isSubPath('drive', 'drive', true)).toBe(true);
            expect(isSubPath('drive', '/drive', true)).toBe(true);
            expect(isSubPath('drive', '/drive/', true)).toBe(true);
            expect(isSubPath('/drive', 'drive', true)).toBe(true);
            expect(isSubPath('/drive/', 'drive', true)).toBe(true);
            expect(isSubPath('/drive/', '/drive', true)).toBe(true);
            expect(isSubPath('drive/', 'drive', true)).toBe(true);
            expect(isSubPath('/root/folder/file', 'root/sub')).toBe(false);
        });
    });

    describe('getRootPath', () => {
        it('should return root path', () => {
            expect(getRootPath('/root/sub')).toBe('root');
            expect(getRootPath('/root/sub/')).toBe('root');
            expect(getRootPath('root/sub')).toBe('root');
            expect(getRootPath('root/sub/')).toBe('root');
            expect(getRootPath('/root')).toBe('root');
            expect(getRootPath('root')).toBe('root');
            expect(getRootPath('root/')).toBe('root');
            expect(getRootPath('/root/')).toBe('root');
            expect(getRootPath('/documents/budget/2021/file')).toBe(
                'documents',
            );
            expect(getRootPath('/documents/budget/2021/file/')).toBe(
                'documents',
            );
            expect(getRootPath('/')).toBe('/');
            expect(getRootPath('')).toBe('/');
        });
    });
});
