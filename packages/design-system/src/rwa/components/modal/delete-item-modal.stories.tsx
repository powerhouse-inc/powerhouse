import type { Meta, StoryObj } from '@storybook/react';
import { RWADeleteItemModal } from './delete-item-modal';

const meta: Meta<typeof RWADeleteItemModal> = {
    title: 'RWA/Components/Modal/RWADeleteItemModal',
    component: RWADeleteItemModal,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        open: true,
        itemName: 'account',
        dependentItemName: 'service providers and transactions',
        dependentItemList: [
            <div className="mb-0.5 font-semibold" key={1}>
                Service providers:
            </div>,
            <div key={2}>Service provider 1</div>,
            <div key={3}>Service provider 2</div>,
            <div key={4}>Service provider 3</div>,
            <div className="mb-0.5 mt-1 font-semibold" key={5}>
                Transactions:
            </div>,
            <div key={6}>Transaction 1</div>,
            <div key={7}>Transaction 2</div>,
            <div key={8}>Transaction 3</div>,
        ],
    },
};
