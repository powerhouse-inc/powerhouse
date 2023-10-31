import type { Meta, StoryObj } from '@storybook/react';
import { Button } from 'react-aria-components';
import { Modal } from './modal';

const meta: Meta<typeof Modal> = {
    title: 'Powerhouse/Components/Modal',
    component: Modal,
    argTypes: {
        open: { control: { type: 'boolean' } },
        children: { control: { type: 'text' } },
        onClose: { control: { type: 'action' } },
        dialogProps: { control: { type: 'object' } },
        modalProps: { control: { type: 'object' } },
        overlayProps: { control: { type: 'object' } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

const children = (
    <div className="w-[465px] h-[300px] p-10 flex flex-col justify-between">
        <div className="text-xl">Header</div>
        <div>
            Lorem ipsum dolor sit amet consectetur adipisicing elit. Labore, ea.
            Quo deserunt amet iusto iste? Magni, a distinctio? Aperiam, sapiente
            ipsam. Sapiente corrupti explicabo deserunt nisi sit cupiditate
            maxime quis.
        </div>
        <div>
            <Button className="rounded bg-red-400 p-2 text-white">
                Cancel
            </Button>
        </div>
    </div>
);

export const Primary: Story = {
    args: {
        open: true,
        children,
        modalProps: {
            className: 'top-10',
        },
        dialogProps: {
            className: 'rounded-3xl',
        },
    },
};
