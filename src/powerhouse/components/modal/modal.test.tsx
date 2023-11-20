import { fireEvent, render, screen } from '@testing-library/react';
import { Modal } from './modal';

describe('Modal Component', () => {
    it('should match snapshot', () => {
        render(
            <Modal open={true} onClose={() => {}} data-testid="modal">
                <div>Modal Content</div>
            </Modal>,
        );

        const modalComponent = screen.getByTestId('modal');

        expect(modalComponent).toMatchSnapshot();
    });

    it('should display modal content when open', () => {
        render(
            <Modal open={true} onClose={() => {}}>
                <div>Modal Content</div>
            </Modal>,
        );

        expect(screen.getByText('Modal Content')).toBeInTheDocument();
    });

    it('should call onClose callback when press esc', () => {
        const onClose = vi.fn();
        render(
            <Modal open={true} onClose={onClose}>
                <div>Modal Content</div>
            </Modal>,
        );

        fireEvent.keyDown(screen.getByText('Modal Content'), {
            key: 'Escape',
            code: 'Escape',
        });

        expect(onClose).toHaveBeenCalled();
    });
});
