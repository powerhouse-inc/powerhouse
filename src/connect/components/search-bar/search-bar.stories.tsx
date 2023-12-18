import { Icon } from '@/powerhouse';
import type { Meta, StoryObj } from '@storybook/react';
import { ConnectSearchBar, ConnectSearchBarProps } from './search-bar';

const filterItems: ConnectSearchBarProps['filterItems'] = [
    {
        id: 'project',
        label: '.project',
        icon: <Icon name="project" className="text-red-700" size={16} />,
    },
    {
        id: 'budget',
        label: '.budget',
        icon: <Icon name="bar-chart" className="text-purple-900" size={16} />,
    },
    {
        id: 'profile',
        label: '.profile',
        icon: <Icon name="person" className="text-blue-900" size={16} />,
    },
    {
        id: 'legal',
        label: '.legal',
        icon: <Icon name="briefcase" className="text-green-900" size={16} />,
    },
    {
        id: 'atlas',
        label: '.Atlas',
        icon: <Icon name="globe" className="text-orange-900" size={16} />,
    },
];

const meta: Meta<typeof ConnectSearchBar> = {
    title: 'Connect/Components/SearchBar',
    component: ConnectSearchBar,
    argTypes: {
        value: { control: { type: 'text' } },
        onChange: { control: { type: 'action' } },
        placeholder: { control: { type: 'text' } },
        filterLabel: { control: { type: 'text' } },
        filterItems: { control: { type: 'object' } },
        onFilterSelect: { control: { type: 'action' } },
        selectedFilter: {
            control: { type: 'select' },
            options: [undefined, ...filterItems.map(item => item.id)],
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        placeholder: 'Search Files',
        filterLabel: 'File type',
        filterItems,
    },
};
