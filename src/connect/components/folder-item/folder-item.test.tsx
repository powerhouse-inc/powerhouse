import { fireEvent, render, screen } from '@testing-library/react';
import { FolderItem } from './folder-item';

describe('FolderItem Component', () => {
    it('should match read snapshot', () => {
        const { asFragment } = render(
            <FolderItem
                mode="read"
                title="Chronicle Labs"
                onClick={() => {}}
                onOptionsClick={() => {}}
                onCancelInput={() => {}}
                onSubmitInput={() => {}}
            />,
        );

        expect(asFragment()).toMatchSnapshot();
    });

    it('should match write snapshot', () => {
        const { asFragment } = render(
            <FolderItem
                mode="write"
                title="Chronicle Labs"
                onClick={() => {}}
                onOptionsClick={() => {}}
                onCancelInput={() => {}}
                onSubmitInput={() => {}}
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
                onCancelInput={() => {}}
                onSubmitInput={() => {}}
            />,
        );

        fireEvent.click(screen.getByText('Chronicle Labs'));
        expect(onClick).toBeCalledTimes(1);
    });
});
