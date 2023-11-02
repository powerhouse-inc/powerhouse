import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TreeViewInput } from './tree-view-input';

describe('TreeViewInput Component', () => {
    let onSubmit: jest.Mock<any, any, any>;
    let onCancel: jest.Mock<any, any, any>;

    const props = {
        level: 0,
        'aria-label': 'input',
        icon: 'Icon',
        initialValue: 'My Documents',
        submitIcon: 'Submit Icon',
        cancelIcon: 'Cancel Icon',
    };

    beforeEach(() => {
        // jest.useFakeTimers();
        onSubmit = jest.fn();
        onCancel = jest.fn();

        render(
            <TreeViewInput
                {...props}
                onSubmit={onSubmit}
                onCancel={onCancel}
            />,
        );
    });

    it('should match snapshot', () => {
        const { asFragment } = render(
            <TreeViewInput
                level={0}
                aria-label="input-label"
                onSubmit={() => {}}
                onCancel={() => {}}
                icon={<div>Icon</div>}
                initialValue="My Documents"
                submitIcon={<div>Submit Icon</div>}
                cancelIcon={<div>Cancel Icon</div>}
            />,
        );

        expect(asFragment()).toMatchSnapshot();
    });

    it('should render correctly', () => {
        expect(screen.getByText(props.icon)).toBeInTheDocument();
        expect(
            screen.getByDisplayValue(props.initialValue),
        ).toBeInTheDocument();
        expect(screen.getByText(props.submitIcon)).toBeInTheDocument();
        expect(screen.getByText(props.cancelIcon)).toBeInTheDocument();
    });

    it('should call onSubmit when click submit icon', () => {
        fireEvent.click(screen.getByText(props.submitIcon));

        expect(onSubmit).toHaveBeenCalled();
    });

    it('should call onSubmit when press enter key', () => {
        fireEvent.keyUp(screen.getByLabelText('input'), {
            key: 'Enter',
        });

        expect(onSubmit).toHaveBeenCalled();
    });

    it('should call onSubmit when click outside', async () => {
        await waitFor(() => screen.getByText(props.submitIcon), {
            timeout: 100,
        });
        fireEvent.click(document.body);

        expect(onSubmit).toHaveBeenCalled();
    });

    it('should call onCancel when click cancel icon', () => {
        fireEvent.click(screen.getByText(props.cancelIcon));

        expect(onCancel).toHaveBeenCalled();
    });

    it('should call onCancel when press Esc key', () => {
        fireEvent.keyUp(screen.getByLabelText('input'), {
            key: 'Escape',
        });

        expect(onCancel).toHaveBeenCalled();
    });

    it('should call onSubmit with text value', () => {
        fireEvent.change(screen.getByLabelText('input'), {
            target: { value: 'new value' },
        });

        fireEvent.click(screen.getByText(props.submitIcon));
        expect(onSubmit).toHaveBeenCalledWith('new value', expect.anything());
    });
});
