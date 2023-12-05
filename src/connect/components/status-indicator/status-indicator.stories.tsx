import { Meta, StoryObj } from '@storybook/react';
import { LocalProps, PublicOrCloudDriveProps, StatusIndicator } from '.';

const meta = {
    title: 'Connect/Components/StatusIndicator',
    component: StatusIndicator,
} satisfies Meta<typeof StatusIndicator>;

export default meta;

type LocalDriveStory = StoryObj<LocalProps>;
type PublicOrCloudDriveStory = StoryObj<PublicOrCloudDriveProps>;

export const LocalDriveSuccess: LocalDriveStory = {
    args: {
        type: 'LOCAL_DRIVE',
    },
};

export const LocalDriveError: LocalDriveStory = {
    args: {
        type: 'LOCAL_DRIVE',
        error: new Error('Something went wrong'),
    },
};

export const LocalDriveWithStyles: LocalDriveStory = {
    args: {
        type: 'LOCAL_DRIVE',
        iconProps: {
            className: 'text-slate-900 hover:text-pink-500',
        },
    },
};

const PublicAvailableOfflineTemplate: PublicOrCloudDriveStory = {
    args: {
        type: 'PUBLIC_DRIVE',
        availability: 'AVAILABLE_OFFLINE',
    },
};

const PublicAvailableOfflineWithConnectionTemplate: PublicOrCloudDriveStory = {
    ...PublicAvailableOfflineTemplate,
    args: {
        ...PublicAvailableOfflineTemplate.args,
        isConnected: true,
    },
};

export const PublicAvailableOfflineWithConnectionSyncing: PublicOrCloudDriveStory =
    {
        ...PublicAvailableOfflineWithConnectionTemplate,
        args: {
            ...PublicAvailableOfflineWithConnectionTemplate.args,
            syncStatus: 'SYNCING',
        },
    };

export const PublicAvailableOfflineWithConnectionSynced: PublicOrCloudDriveStory =
    {
        ...PublicAvailableOfflineWithConnectionTemplate,
        args: {
            ...PublicAvailableOfflineWithConnectionTemplate.args,
            syncStatus: 'SYNCED',
        },
    };

export const PublicAvailableOfflineWithConnectionFailed: PublicOrCloudDriveStory =
    {
        ...PublicAvailableOfflineWithConnectionTemplate,
        args: {
            ...PublicAvailableOfflineWithConnectionTemplate.args,
            error: new Error('Error syncing public drive'),
        },
    };

const PublicAvailableOfflineNoConnectionTemplate: PublicOrCloudDriveStory = {
    ...PublicAvailableOfflineTemplate,
    args: {
        ...PublicAvailableOfflineTemplate.args,
        isConnected: false,
    },
};

export const PublicAvailableOfflineNoConnectionNotSyncedYet: PublicOrCloudDriveStory =
    {
        ...PublicAvailableOfflineNoConnectionTemplate,
        args: {
            ...PublicAvailableOfflineNoConnectionTemplate.args,
            syncStatus: 'NOT_SYNCED_YET',
        },
    };

export const PublicAvailableOfflineNoConnectionFailed: PublicOrCloudDriveStory =
    {
        ...PublicAvailableOfflineNoConnectionTemplate,
        args: {
            ...PublicAvailableOfflineNoConnectionTemplate.args,
            error: new Error('Error syncing public drive'),
        },
    };

const CloudAvailableOfflineTemplate: PublicOrCloudDriveStory = {
    args: {
        type: 'CLOUD_DRIVE',
        availability: 'AVAILABLE_OFFLINE',
    },
};

const CloudAvailableOfflineWithConnectionTemplate: PublicOrCloudDriveStory = {
    ...CloudAvailableOfflineTemplate,
    args: {
        ...CloudAvailableOfflineTemplate.args,
        isConnected: true,
    },
};

export const CloudAvailableOfflineWithConnectionSyncing: PublicOrCloudDriveStory =
    {
        ...CloudAvailableOfflineWithConnectionTemplate,
        args: {
            ...CloudAvailableOfflineWithConnectionTemplate.args,
            syncStatus: 'SYNCING',
        },
    };

export const CloudAvailableOfflineWithConnectionSynced: PublicOrCloudDriveStory =
    {
        ...CloudAvailableOfflineWithConnectionTemplate,
        args: {
            ...CloudAvailableOfflineWithConnectionTemplate.args,
            syncStatus: 'SYNCED',
        },
    };

export const CloudAvailableOfflineWithConnectionFailed: PublicOrCloudDriveStory =
    {
        ...CloudAvailableOfflineWithConnectionTemplate,
        args: {
            ...CloudAvailableOfflineWithConnectionTemplate.args,
            error: new Error('Error syncing cloud drive'),
        },
    };

const CloudAvailableOfflineNoConnectionTemplate: PublicOrCloudDriveStory = {
    ...CloudAvailableOfflineTemplate,
    args: {
        ...CloudAvailableOfflineTemplate.args,
        isConnected: false,
    },
};

export const CloudAvailableOfflineNoConnectionNotSyncedYet: PublicOrCloudDriveStory =
    {
        ...CloudAvailableOfflineNoConnectionTemplate,
        args: {
            ...CloudAvailableOfflineNoConnectionTemplate.args,
            syncStatus: 'NOT_SYNCED_YET',
        },
    };

export const CloudAvailableOfflineNoConnectionFailed: PublicOrCloudDriveStory =
    {
        ...CloudAvailableOfflineNoConnectionTemplate,
        args: {
            ...CloudAvailableOfflineNoConnectionTemplate.args,
            error: new Error('Error syncing cloud drive'),
        },
    };

const PublicCloudOnlyTemplate: PublicOrCloudDriveStory = {
    args: {
        type: 'PUBLIC_DRIVE',
        availability: 'cloud-only',
    },
};

export const PublicCloudOnlyWithConnection: PublicOrCloudDriveStory = {
    ...PublicCloudOnlyTemplate,
    args: {
        ...PublicCloudOnlyTemplate.args,
        isConnected: true,
    },
};

export const PublicCloudOnlyNoConnection: PublicOrCloudDriveStory = {
    ...PublicCloudOnlyTemplate,
    args: {
        ...PublicCloudOnlyTemplate.args,
        isConnected: false,
    },
};

const CloudCloudOnlyTemplate: PublicOrCloudDriveStory = {
    args: {
        type: 'CLOUD_DRIVE',
        availability: 'AVAILABLE_OFFLINE',
    },
};

export const CloudCloudOnlyWithConnection: PublicOrCloudDriveStory = {
    ...CloudCloudOnlyTemplate,
    args: {
        ...CloudCloudOnlyTemplate.args,
        isConnected: true,
    },
};

export const CloudCloudOnlyNoConnection: PublicOrCloudDriveStory = {
    ...CloudCloudOnlyTemplate,
    args: {
        ...CloudCloudOnlyTemplate.args,
        isConnected: false,
    },
};
