import { syncStatuses } from '@/connect';
import { Meta, StoryObj } from '@storybook/react';
import { capitalCase } from 'change-case';
import { SyncStatusIcon } from '.';

const meta = {
    title: 'Connect/Components/SyncStatusIcon',
    component: SyncStatusIcon,
} satisfies Meta<typeof SyncStatusIcon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        syncStatus: 'SYNCING',
    },
    render: function Wrapper() {
        return (
            <div className="flex flex-col flex-wrap gap-4">
                {syncStatuses.map(status => (
                    <p key={status} className="flex items-center gap-2">
                        {capitalCase(status)}{' '}
                        <SyncStatusIcon syncStatus={status} />
                    </p>
                ))}
            </div>
        );
    },
};

export const WithDifferentSizes: Story = {
    args: {
        syncStatus: 'SYNCING',
    },
    render: function Wrapper() {
        return (
            <div className="flex flex-col flex-wrap gap-4">
                {syncStatuses.map((status, index) => (
                    <p key={status} className="flex items-center gap-2">
                        {capitalCase(status)}{' '}
                        <SyncStatusIcon
                            syncStatus={status}
                            size={(index + 1) * 24}
                        />
                    </p>
                ))}
            </div>
        );
    },
};

export const WithDifferentColors: Story = {
    args: {
        syncStatus: 'SYNCING',
    },
    render: function Wrapper() {
        return (
            <div className="flex flex-col flex-wrap gap-4">
                {syncStatuses.map(status => (
                    <p key={status} className="flex items-center gap-2">
                        {capitalCase(status)}{' '}
                        <SyncStatusIcon
                            syncStatus={status}
                            className="text-gray-900"
                        />
                    </p>
                ))}
            </div>
        );
    },
};
