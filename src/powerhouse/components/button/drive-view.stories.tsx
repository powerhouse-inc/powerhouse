import type { Meta, StoryObj } from '@storybook/react';
import { DriveView as DriveViewComponent } from '../components/drive-view';

const meta = {
    title: 'Powerhouse/Components',
    component: DriveViewComponent,
    parameters: {
        layout: 'centered',
    },
    decorators: [
        Story => (
            <div className="bg-neutral-1 p-10">
                <Story />
            </div>
        ),
    ],
    argTypes: {},
} satisfies Meta<typeof DriveViewComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Public: Story = {
    args: {
        name: 'Public Drives',
        type: 'public',
        className: 'w-[272px]',
    },
};

export const Cloud: Story = {
    args: {
        name: 'Secure Cloud Storage',
        type: 'cloud',
        className: 'w-[272px]',
    },
};

export const Local: Story = {
    args: {
        name: 'My Local Drives',
        type: 'local',
        className: 'w-[272px]',
    },
};
