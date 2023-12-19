import { TreeItem, usePathContent } from '@powerhousedao/design-system';

export type FolderConent = {
    folders: TreeItem[];
    files: TreeItem[];
};

export const useFolderContent = (path: string): FolderConent => {
    const items = usePathContent(path);

    const folderContent = items.reduce<FolderConent>(
        (acc, item) => {
            const { folders, files } = acc;

            if (item.type === 'FOLDER') {
                folders.push(item);
            } else if (item.type === 'FILE') {
                files.push(item);
            }

            return { folders, files };
        },
        { folders: [], files: [] }
    );

    return folderContent;
};
