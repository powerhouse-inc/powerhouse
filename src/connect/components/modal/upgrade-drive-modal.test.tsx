import { fireEvent, render, screen } from '@testing-library/react';
import { ConnectUpgradeDriveModal } from './upgrade-drive-modal';

describe('UpgradeDriveModal Component', () => {
    it('should match snapshot', () => {
        render(
            <ConnectUpgradeDriveModal
                open={true}
                onClose={() => {}}
                data-testid="upgrade-drive-modal"
                body="You are moving files from a private to a shared drive. These files will become accessible to others in the shared drive.Do you want to proceed?"
                cancelLabel="Cancel"
                continueLabel="Continue"
                header="Upgrade to cloud drive"
                onContinue={() => {}}
            />,
        );

        const modalComponent = screen.getByTestId('upgrade-drive-modal');

        expect(modalComponent).toMatchSnapshot();
    });

    it('should render modal content', () => {
        const headerText = 'Upgrade to cloud drive';
        const bodyText =
            'ou are moving files from a private to a shared drive. These files will become accessible to others in the shared drive.Do you want to proceed?';
        const cancelLabel = 'Cancel';
        const continueLabel = 'Continue';

        render(
            <ConnectUpgradeDriveModal
                open={true}
                onClose={() => {}}
                data-testid="upgrade-drive-modal"
                body={bodyText}
                cancelLabel={cancelLabel}
                continueLabel={continueLabel}
                header={headerText}
                onContinue={() => {}}
            />,
        );

        const header = screen.getByText(headerText);
        const body = screen.getByText(bodyText);
        const cancelButton = screen.getByText(cancelLabel);
        const deleteButton = screen.getByText(continueLabel);

        expect(header).toBeInTheDocument();
        expect(body).toBeInTheDocument();
        expect(cancelButton).toBeInTheDocument();
        expect(deleteButton).toBeInTheDocument();
    });

    it('should trigger onClose callback when cancel is clicked', () => {
        const onClose = jest.fn();
        const cancelLabel = 'Cancel';

        render(
            <ConnectUpgradeDriveModal
                open={true}
                onClose={onClose}
                data-testid="upgrade-drive-modal"
                cancelLabel={cancelLabel}
                body="You are moving files from a private to a shared drive. These files will become accessible to others in the shared drive.Do you want to proceed?"
                continueLabel="Continue"
                header="Upgrade to cloud drive"
                onContinue={() => {}}
            />,
        );

        fireEvent.click(screen.getByText(cancelLabel));

        expect(onClose).toHaveBeenCalled();
    });

    it('should trigger onDelete callback when CTA is clicked', () => {
        const onDelete = jest.fn();
        const continueLabel = 'Continue';

        render(
            <ConnectUpgradeDriveModal
                open={true}
                onClose={() => {}}
                data-testid="upgrade-drive-modal"
                body="You are moving files from a private to a shared drive. These files will become accessible to others in the shared drive.Do you want to proceed?"
                cancelLabel="Cancel"
                continueLabel={continueLabel}
                header="Upgrade to cloud drive"
                onContinue={onDelete}
            />,
        );

        fireEvent.click(screen.getByText(continueLabel));

        expect(onDelete).toHaveBeenCalled();
    });
});
