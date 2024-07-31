import { Icon } from '@/powerhouse';
import type { Meta, StoryObj } from '@storybook/react';
import { ConnectSearchBar, ConnectSearchBarProps } from './search-bar';

const filterItems: ConnectSearchBarProps['filterItems'] = [
    {
        id: 'project',
        label: '.project',
        icon: <Icon name="Project" className="text-red-700" size={16} />,
    },
    {
        id: 'budget',
        label: '.budget',
        icon: <Icon name="BarChart" className="text-purple-900" size={16} />,
    },
    {
        id: 'profile',
        label: '.profile',
        icon: <Icon name="Person" className="text-blue-900" size={16} />,
    },
    {
        id: 'legal',
        label: '.legal',
        icon: <Icon name="Briefcase" className="text-green-900" size={16} />,
    },
    {
        id: 'atlas',
        label: '.Atlas',
        icon: <Icon name="Globe" className="text-orange-900" size={16} />,
    },
];

const meta: Meta<typeof ConnectSearchBar> = {
    title: 'Connect/Components/SearchBar',
    component: ConnectSearchBar,
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
