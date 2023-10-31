import { fireEvent, render, screen } from '@testing-library/react';
import { ConnectDeleteItemModal } from './delete-item-modal';

describe('Modal Component', () => {
    it('should match snapshot', () => {
        render(
            <ConnectDeleteItemModal
                open={true}
                onClose={() => {}}
                data-testid="delete-modal"
                body="Are you sure you want to delete this folder? All files and subfolders within it will be removed."
                cancelLabel="Cancel"
                deleteLabel="Delete"
                header="Delete “Ecosystem Actors” folder?"
                onDelete={() => {}}
            />,
        );

        const modalComponent = screen.getByTestId('delete-modal');

        expect(modalComponent).toMatchSnapshot();
    });

    it('should render modal content', () => {
        const headerText = 'Delete “Ecosystem Actors” folder?';
        const bodyText =
            'Are you sure you want to delete this folder? All files and subfolders within it will be removed.';
        const cancelLabel = 'Cancel';
        const deleteLabel = 'Delete';

        render(
            <ConnectDeleteItemModal
                open={true}
                onClose={() => {}}
                data-testid="delete-modal"
                body={bodyText}
                cancelLabel={cancelLabel}
                deleteLabel={deleteLabel}
                header={headerText}
                onDelete={() => {}}
            />,
        );

        const header = screen.getByText(headerText);
        const body = screen.getByText(bodyText);
        const cancelButton = screen.getByText(cancelLabel);
        const deleteButton = screen.getByText(deleteLabel);

        expect(header).toBeInTheDocument();
        expect(body).toBeInTheDocument();
        expect(cancelButton).toBeInTheDocument();
        expect(deleteButton).toBeInTheDocument();
    });

    it('should trigger onClose callback when cancel is clicked', () => {
        const onClose = jest.fn();
        const cancelLabel = 'Cancel';

        render(
            <ConnectDeleteItemModal
                open={true}
                onClose={onClose}
                data-testid="delete-modal"
                body="Are you sure you want to delete this folder? All files and subfolders within it will be removed."
                cancelLabel={cancelLabel}
                deleteLabel="Delete"
                header="Delete “Ecosystem Actors” folder?"
                onDelete={() => {}}
            />,
        );

        fireEvent.click(screen.getByText(cancelLabel));

        expect(onClose).toHaveBeenCalled();
    });

    it('should trigger onDelete callback when CTA is clicked', () => {
        const onDelete = jest.fn();
        const deleteLabel = 'Delete';

        render(
            <ConnectDeleteItemModal
                open={true}
                onClose={() => {}}
                data-testid="delete-modal"
                body="Are you sure you want to delete this folder? All files and subfolders within it will be removed."
                cancelLabel="Cancel"
                deleteLabel={deleteLabel}
                header="Delete “Ecosystem Actors” folder?"
                onDelete={onDelete}
            />,
        );

        fireEvent.click(screen.getByText(deleteLabel));

        expect(onDelete).toHaveBeenCalled();
    });
});
