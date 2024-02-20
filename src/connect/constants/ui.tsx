import { Icon } from '@/powerhouse';
export const PUBLIC_DRIVE = 'PUBLIC_DRIVE';
export const LOCAL_DRIVE = 'LOCAL_DRIVE';
export const CLOUD_DRIVE = 'CLOUD_DRIVE';
export const FOLDER = 'FOLDER';
export const FILE = 'FILE';

export const driveTypes = [PUBLIC_DRIVE, LOCAL_DRIVE, CLOUD_DRIVE] as const;

export const treeItemTypes = [...driveTypes, FOLDER, FILE] as const;

export const UPDATE = 'UPDATE';
export const NEW = 'NEW';
export const UPDATE_AND_MOVE = 'UPDATE_AND_MOVE';
export const UPDATE_AND_COPY = 'UPDATE_AND_COPY';

export const treeItemActions = [
    UPDATE,
    NEW,
    UPDATE_AND_MOVE,
    UPDATE_AND_COPY,
] as const;

export const LOCAL = 'LOCAL';
export const CLOUD = 'CLOUD';
export const SWITCHBOARD = 'SWITCHBOARD';

export const driveLocations = [LOCAL, CLOUD, SWITCHBOARD] as const;

export const defaultDropdownMenuOptions = [
    {
        id: 'duplicate',
        label: 'Duplicate',
        icon: <Icon name="files-earmark" />,
    },
    {
        id: 'new-folder',
        label: 'New Folder',
        icon: <Icon name="folder-plus" />,
    },
    {
        id: 'rename',
        label: 'Rename',
        icon: <Icon name="pencil" />,
    },
    {
        id: 'delete',
        label: 'Delete',
        icon: <Icon name="trash" />,
        className: 'text-red-900',
    },
] as const;

export const PRIVATE = 'PRIVATE';
export const SHARED = 'SHARED';
export const PUBLIC = 'PUBLIC';

export const sharingTypes = [PRIVATE, SHARED, PUBLIC] as const;

export const sharingTypeOptions = [
    {
        value: PRIVATE,
        icon: <Icon name="lock" />,
        description: 'Only available to you',
    },
    {
        value: SHARED,
        icon: <Icon name="people" />,
        description: 'Only available to people in this drive',
    },
    {
        value: PUBLIC,
        icon: <Icon name="globe" />,
        description: 'Available to everyone',
        disabled: true,
    },
] as const;

export const locationInfoByLocation = {
    CLOUD: {
        title: 'Secure cloud',
        description: 'End to end encryption between members.',
        icon: <Icon name="lock" />,
    },
    LOCAL: {
        title: 'Local',
        description: 'Private and only available to you.',
        icon: <Icon name="hdd" />,
    },
    SWITCHBOARD: {
        title: 'Switchboard',
        description: 'Public and available to everyone.',
        icon: <Icon name="drive" />,
    },
} as const;

export const SYNCING = 'SYNCING';
export const SUCCESS = 'SUCCESS';
export const CONFLICT = 'CONFLICT';
export const MISSING = 'MISSING';
export const ERROR = 'ERROR';

export const syncStatuses = [
    SYNCING,
    SUCCESS,
    CONFLICT,
    MISSING,
    ERROR,
] as const;
