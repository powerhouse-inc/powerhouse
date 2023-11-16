import { Icon } from '@/powerhouse';
import type { Meta, StoryObj } from '@storybook/react';
import { ConnectSearchBar, ConnectSearchBarProps } from './search-bar';

const filterItems: ConnectSearchBarProps['filterItems'] = [
    {
        id: 'project',
        label: '.project',
        icon: <Icon name="project" color="#FF6A55" size={16} />,
    },
    {
        id: 'budget',
        label: '.budget',
        icon: <Icon name="bar-chart" color="#8E55EA" size={16} />,
    },
    {
        id: 'profile',
        label: '.profile',
        icon: <Icon name="person" color="#3E90F0" size={16} />,
    },
    {
        id: 'legal',
        label: '.legal',
        icon: <Icon name="briefcase" color="#4BAB71" size={16} />,
    },
    {
        id: 'atlas',
        label: '.Atlas',
        icon: <Icon name="globe" color="#FF8A00" size={16} />,
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
