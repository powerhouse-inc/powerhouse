import { TreeItem } from '@/connect';

export const randomId = function (length = 10) {
    return Math.random()
        .toString(36)
        .substring(2, length + 2);
};

/**
 * Generates mock drive data based on the provided drive item.
 * @param driveItem - The drive item to generate mock data for.
 * @returns An array of tree items representing the mock drive data.
 */
export const generateMockDriveData = (
    driveItem: Omit<TreeItem, 'id' | 'parentFolder'>,
) => {
    const drive = driveItem.path;

    const treeItems: Array<TreeItem> = [
        {
            ...driveItem,
            id: 'drive',
            parentFolder: null,
            path: drive,
        },
        {
            id: 'folder1',
            path: `${drive}/folder1`,
            parentFolder: 'drive',
            label: 'Folder 1',
            type: 'FOLDER',
            availableOffline: false,
            syncStatus: 'SYNCING',
        },
        {
            id: 'folder1.1',
            parentFolder: 'folder1',
            path: `${drive}/folder1/folder1.1`,
            label: 'Folder 1.1',
            type: 'FOLDER',
            availableOffline: false,
            syncStatus: 'SYNCING',
        },
        {
            id: 'folder1.2',
            parentFolder: 'folder1',
            path: `${drive}/folder1/folder1.2`,
            label: 'Folder 1.2',
            type: 'FOLDER',
            availableOffline: false,
            syncStatus: 'SYNCING',
        },
        {
            id: 'folder1.2.1',
            parentFolder: 'folder1.2',
            path: `${drive}/folder1/folder1.2/folder1.2.1`,
            label: 'Folder 1.2.1',
            type: 'FOLDER',
            availableOffline: false,
            syncStatus: 'SYNCING',
        },
        {
            id: 'folder2',
            parentFolder: 'drive',
            path: `${drive}/folder2`,
            label: 'Folder 2',
            type: 'FOLDER',
            availableOffline: false,
            syncStatus: 'SYNCING',
        },
        {
            id: 'folder2.1',
            parentFolder: 'folder2',
            path: `${drive}/folder2/folder2.1`,
            label: 'Folder 2.1',
            type: 'FOLDER',
            availableOffline: false,
            syncStatus: 'SYNCING',
        },
        {
            id: 'folder3',
            parentFolder: 'drive',
            path: `${drive}/folder3`,
            label: 'Folder 3 Folder 3 Folder 3 Folder 3 Folder 3',
            type: 'FOLDER',
            availableOffline: false,
            syncStatus: 'SYNCING',
        },
    ];

    return treeItems;
};
