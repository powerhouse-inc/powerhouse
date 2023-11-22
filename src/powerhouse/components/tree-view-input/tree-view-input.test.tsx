import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Mock } from 'vitest';
import { TreeViewInput } from './tree-view-input';

describe('TreeViewInput Component', () => {
    let onSubmitInput: Mock;
    let onCancelInput: Mock;

    const props = {
        level: 0,
        'aria-label': 'input',
        icon: 'Icon',
        defaultValue: 'My Documents',
        submitIcon: <div>submit</div>,
        cancelIcon: <div>cancel</div>,
    };

    beforeEach(() => {
        onSubmitInput = vi.fn();
        onCancelInput = vi.fn();

        render(
            <TreeViewInput
                {...props}
                onSubmitInput={onSubmitInput}
                onCancelInput={onCancelInput}
            />,
        );
    });

    it('should match snapshot', () => {
        const { asFragment } = render(
            <TreeViewInput
                aria-label="input-label"
                onSubmitInput={() => {}}
                onCancelInput={() => {}}
                defaultValue="My Documents"
                submitIcon={<div>submit</div>}
                cancelIcon={<div>cancel</div>}
            />,
        );

        expect(asFragment()).toMatchSnapshot();
    });

    it('should render correctly', () => {
        expect(
            screen.getByDisplayValue(props.defaultValue),
        ).toBeInTheDocument();
        expect(screen.getByText('submit')).toBeInTheDocument();
        expect(screen.getByText('cancel')).toBeInTheDocument();
    });

    it('should call onSubmitInput when click submit icon', () => {
        fireEvent.click(screen.getByText('submit'));

        expect(onSubmitInput).toHaveBeenCalled();
    });

    it('should call onSubmitInput when press enter key', () => {
        fireEvent.keyUp(screen.getByLabelText('input'), {
            key: 'Enter',
        });

        expect(onSubmitInput).toHaveBeenCalled();
    });

    it('should call onSubmitInput when click outside', async () => {
        await waitFor(() => screen.getByText('submit'), {
            timeout: 100,
        });
        fireEvent.click(document.body);

        expect(onSubmitInput).toHaveBeenCalled();
    });

    it('should call onCancelInput when click cancel icon', () => {
        fireEvent.click(screen.getByText('cancel'));

        expect(onCancelInput).toHaveBeenCalled();
    });

    it('should call onCancelInput when press Esc key', () => {
        fireEvent.keyUp(screen.getByLabelText('input'), {
            key: 'Escape',
        });

        expect(onCancelInput).toHaveBeenCalled();
    });

    it('should call onSubmitInput with text value', () => {
        fireEvent.change(screen.getByLabelText('input'), {
            target: { value: 'new value' },
        });

        fireEvent.click(screen.getByText('submit'));
        expect(onSubmitInput).toHaveBeenCalledWith(
            'new value',
            expect.anything(),
        );
    });
});
