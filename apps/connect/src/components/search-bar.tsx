import {
    ConnectSearchBar,
    ConnectSearchBarProps,
    Icon,
} from '@powerhousedao/design-system';
import { useTranslation } from 'react-i18next';

const defaultFilterItems: ConnectSearchBarProps['filterItems'] = [
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

export const SearchBar = () => {
    const { t } = useTranslation();

    return (
        <ConnectSearchBar
            className="m-4 max-w-searchbar-width shrink-0 bg-gray-100"
            placeholder={t('searchbar.placeholder')}
            filterLabel={t('searchbar.filterLabel')}
            filterItems={defaultFilterItems}
        />
    );
};
