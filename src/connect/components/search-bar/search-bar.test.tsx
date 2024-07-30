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
                value="test"
                onChange={() => {}}
            />,
        );

        expect(asFragment()).toMatchSnapshot();
    });

    it('should call onChange when input value is changed', () => {
        const onChange = vi.fn();

        render(
            <ConnectSearchBar
                placeholder="Search Files"
                filterLabel="File type"
                filterItems={filterItems}
                data-testid="search-bar"
                value=""
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
                value="test"
                onChange={() => {}}
                selectedFilter="project"
            />,
        );

        expect(screen.getByText('.project')).toBeInTheDocument();
        expect(screen.queryByText('File type')).not.toBeInTheDocument();
    });
});
