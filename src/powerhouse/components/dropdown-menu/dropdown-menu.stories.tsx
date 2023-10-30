import type { Meta, StoryObj } from '@storybook/react';
import { DropdownMenu } from './dropdown-menu';

const meta = {
    title: 'Powerhouse/Components/DropdownMenu',
    component: DropdownMenu,
    argTypes: {
        onItemClick: { action: 'onItemClick' },
        children: { control: { type: 'text' } },
        items: { control: { type: 'object' } },
        className: { control: { type: 'text' } },
        menuClassName: { control: { type: 'text' } },
        menuItemClassName: { control: { type: 'text' } },
    },
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        className:
            'bg-blue-500 text-white w-8 h-8 rounded justify-center items-center flex',
        menuClassName:
            'border-2 border-indigo-600 w-64 rounded bg-white cursor-pointer',
        menuItemClassName: 'hover:bg-gray-200 px-2',
        children: '☰',
        items: [
            {
                id: 'item-1',
                content: 'Item 1',
            },
            {
                id: 'item-2',
                content: 'Item 2',
            },
            {
                id: 'item-3',
                content: 'Item 3',
            },
        ],
    },
};
