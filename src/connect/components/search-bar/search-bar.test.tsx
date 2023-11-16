import { fireEvent, render, screen } from '@testing-library/react';
import { ConnectSearchBar, ConnectSearchBarProps } from './search-bar';

const filterItems: ConnectSearchBarProps['filterItems'] = [
    {
        id: 'project',
        label: '.project',
    },
    {
        id: 'budget',
        label: '.budget',
    },
    {
        id: 'profile',
        label: '.profile',
    },
    {
        id: 'legal',
        label: '.legal',
    },
    {
        id: 'atlas',
        label: '.Atlas',
    },
];

describe('ConnectSearchBar Component', () => {
    it('should match snapshot', () => {
        const { asFragment } = render(
            <ConnectSearchBar
                placeholder="Search Files"
                filterLabel="File type"
                filterItems={filterItems}
                textFieldProps={{ 'aria-label': 'search input' }}
            />,
        );

        expect(asFragment()).toMatchSnapshot();
    });

    it('should open filter menu when click on filters', () => {
        render(
            <ConnectSearchBar
                placeholder="Search Files"
                filterLabel="File type"
                filterItems={filterItems}
                data-testid="search-bar"
                textFieldProps={{ 'aria-label': 'search input' }}
            />,
        );

        fireEvent.click(screen.getByText('File type'));

        expect(screen.getByText('.project')).toBeInTheDocument();
        expect(screen.getByText('.budget')).toBeInTheDocument();
        expect(screen.getByText('.profile')).toBeInTheDocument();
        expect(screen.getByText('.legal')).toBeInTheDocument();
        expect(screen.getByText('.Atlas')).toBeInTheDocument();
    });

    it('should call onFilterSelect when a filter is selected', () => {
        const onFilterSelect = jest.fn();

        render(
            <ConnectSearchBar
                placeholder="Search Files"
                filterLabel="File type"
                filterItems={filterItems}
                data-testid="search-bar"
                textFieldProps={{ 'aria-label': 'search input' }}
                onFilterSelect={onFilterSelect}
            />,
        );

        fireEvent.click(screen.getByText('File type'));
        fireEvent.click(screen.getByText('.project'));

        expect(onFilterSelect).toBeCalledTimes(1);
        expect(onFilterSelect).toBeCalledWith('project');
    });

    it('should call onChange when input value is changed', () => {
        const onChange = jest.fn();

        render(
            <ConnectSearchBar
                placeholder="Search Files"
                filterLabel="File type"
                filterItems={filterItems}
                data-testid="search-bar"
                textFieldProps={{ 'aria-label': 'search input' }}
                onChange={onChange}
            />,
        );

        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: 'test' },
        });

        expect(onChange).toBeCalledTimes(1);
        expect(onChange).toBeCalledWith('test');
    });

    it('should display filter selected in filter label', () => {
        render(
            <ConnectSearchBar
                placeholder="Search Files"
                filterLabel="File type"
                filterItems={filterItems}
                data-testid="search-bar"
                textFieldProps={{ 'aria-label': 'search input' }}
                selectedFilter="project"
            />,
        );

        expect(screen.getByText('.project')).toBeInTheDocument();
        expect(screen.queryByText('File type')).not.toBeInTheDocument();
    });
});
