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
export const generateMockDriveData = (driveItem: Omit<TreeItem, 'id'>) => {
    const drive = driveItem.path;

    const treeItems: Array<TreeItem> = [
        {
            ...driveItem,
            id: randomId(),
            path: drive,
        },
        {
            id: randomId(),
            path: `${drive}/folder1`,
            label: 'Folder 1',
            type: 'FOLDER',
            availableOffline: false,
            syncStatus: 'SYNCING',
        },
        {
            id: randomId(),
            path: `${drive}/folder1/folder1.1`,
            label: 'Folder 1.1',
            type: 'FOLDER',
            availableOffline: false,
            syncStatus: 'SYNCING',
        },
        {
            id: randomId(),
            path: `${drive}/folder1/folder1.2`,
            label: 'Folder 1.2',
            type: 'FOLDER',
            availableOffline: false,
            syncStatus: 'SYNCING',
        },
        {
            id: randomId(),
            path: `${drive}/folder1/folder1.2/folder1.2.1`,
            label: 'Folder 1.2.1',
            type: 'FOLDER',
            availableOffline: false,
            syncStatus: 'SYNCING',
        },
        {
            id: randomId(),
            path: `${drive}/folder2`,
            label: 'Folder 2',
            type: 'FOLDER',
            availableOffline: false,
            syncStatus: 'SYNCING',
        },
        {
            id: randomId(),
            path: `${drive}/folder2/folder2.1`,
            label: 'Folder 2.1',
            type: 'FOLDER',
            availableOffline: false,
            syncStatus: 'SYNCING',
        },
        {
            id: randomId(),
            path: `${drive}/folder3`,
            label: 'Folder 3',
            type: 'FOLDER',
            availableOffline: false,
            syncStatus: 'SYNCING',
        },
    ];

    return treeItems;
};
