import { fireEvent, render, screen } from '@testing-library/react';
import { FolderItem } from './folder-item';

describe('FolderItem Component', () => {
    it('should match snapshot', () => {
        const { asFragment } = render(
            <FolderItem
                title="Chronicle Labs"
                onClick={() => {}}
                onOptionsClick={() => {}}
            />,
        );

        expect(asFragment()).toMatchSnapshot();
    });

    it('should call onClick handler', () => {
        const onClick = vi.fn();

        render(
            <FolderItem
                title="Chronicle Labs"
                onClick={onClick}
                onOptionsClick={() => {}}
            />,
        );

        fireEvent.click(screen.getByText('Chronicle Labs'));
        expect(onClick).toBeCalledTimes(1);
    });
});
