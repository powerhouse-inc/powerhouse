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
        type: 'local-drive',
    },
};

export const LocalDriveError: LocalDriveStory = {
    args: {
        type: 'local-drive',
        error: new Error('Something went wrong'),
    },
};

export const LocalDriveWithStyles: LocalDriveStory = {
    args: {
        type: 'local-drive',
        iconProps: {
            className: 'text-[#000] hover:text-pink-500',
        },
    },
};

const PublicAvailableOfflineTemplate: PublicOrCloudDriveStory = {
    args: {
        type: 'public-drive',
        availability: 'available-offline',
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
            syncStatus: 'syncing',
        },
    };

export const PublicAvailableOfflineWithConnectionSynced: PublicOrCloudDriveStory =
    {
        ...PublicAvailableOfflineWithConnectionTemplate,
        args: {
            ...PublicAvailableOfflineWithConnectionTemplate.args,
            syncStatus: 'synced',
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
            syncStatus: 'not-synced-yet',
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
        type: 'cloud-drive',
        availability: 'available-offline',
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
            syncStatus: 'syncing',
        },
    };

export const CloudAvailableOfflineWithConnectionSynced: PublicOrCloudDriveStory =
    {
        ...CloudAvailableOfflineWithConnectionTemplate,
        args: {
            ...CloudAvailableOfflineWithConnectionTemplate.args,
            syncStatus: 'synced',
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
            syncStatus: 'not-synced-yet',
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
        type: 'public-drive',
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
        type: 'cloud-drive',
        availability: 'available-offline',
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
