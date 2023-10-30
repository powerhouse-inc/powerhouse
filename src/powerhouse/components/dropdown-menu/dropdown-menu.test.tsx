import { fireEvent, render, screen } from '@testing-library/react';
import { DropdownMenu, DropdownMenuProps } from './dropdown-menu';

const children = '☰';
const items: DropdownMenuProps['items'] = [
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
];

describe('DropDownMenu Component', () => {
    it('should match snapshot', () => {
        const { asFragment } = render(
            <DropdownMenu onItemClick={() => {}} items={items}>
                <div>{children}</div>
            </DropdownMenu>,
        );

        expect(asFragment()).toMatchSnapshot();
    });

    it('should render correctly', () => {
        render(
            <DropdownMenu onItemClick={() => {}} items={items}>
                <div>{children}</div>
            </DropdownMenu>,
        );

        expect(screen.getByText(children)).toBeInTheDocument();
    });

    it('should open menu when click in menu button', () => {
        render(
            <DropdownMenu onItemClick={() => {}} items={items}>
                <div>{children}</div>
            </DropdownMenu>,
        );

        fireEvent(
            screen.getByText(children),
            new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
            }),
        );

        expect(
            screen.getByText(items[0].content as string),
        ).toBeInTheDocument();
    });

    it.each(items)('should call fn callback for item %s', item => {
        const onItemClick = jest.fn();

        render(
            <DropdownMenu onItemClick={onItemClick} items={items}>
                <div>{children}</div>
            </DropdownMenu>,
        );

        fireEvent(
            screen.getByText(children),
            new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
            }),
        );

        fireEvent(
            screen.getByText(item.content as string),
            new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
            }),
        );

        expect(onItemClick).toHaveBeenCalledWith(item.id);
    });
});
