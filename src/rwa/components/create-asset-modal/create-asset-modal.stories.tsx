import type { Meta, StoryObj } from '@storybook/react';
import { RWACreateAssetModal } from './create-asset-modal';

const meta: Meta<typeof RWACreateAssetModal> = {
    title: 'RWA/Components/RWACreateAssetModal',
    component: RWACreateAssetModal,
    argTypes: {
        onSubmit: { action: 'onSubmit' },
        labels: { control: { type: 'object' } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    decorators: [
        Story => (
            <div className="bg-slate-50 p-12">
                <Story />
            </div>
        ),
    ],
    args: {
        labels: {
            button: 'Create Asset',
            cancel: 'Cancel',
            createAsset: 'Create new asset',
        },
    },
};
