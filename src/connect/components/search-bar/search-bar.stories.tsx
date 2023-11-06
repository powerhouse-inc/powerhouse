import BarChartIcon from '@/assets/icons/bar-chart-fill.svg';
import BriefCaseIcon from '@/assets/icons/briefcase-fill.svg';
import GlobeIcon from '@/assets/icons/globe.svg';
import PersonIcon from '@/assets/icons/person-fill.svg';
import ProjectIcon from '@/assets/icons/project-fill.svg';
import type { Meta, StoryObj } from '@storybook/react';
import { ConnectSearchBar, ConnectSearchBarProps } from './search-bar';

const filterItems: ConnectSearchBarProps['filterItems'] = [
    {
        id: 'project',
        label: '.project',
        icon: ProjectIcon,
    },
    {
        id: 'budget',
        label: '.budget',
        icon: BarChartIcon,
    },
    {
        id: 'profile',
        label: '.profile',
        icon: PersonIcon,
    },
    {
        id: 'legal',
        label: '.legal',
        icon: BriefCaseIcon,
    },
    {
        id: 'atlas',
        label: '.Atlas',
        icon: GlobeIcon,
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
