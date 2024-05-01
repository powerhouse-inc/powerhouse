import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Mock } from 'vitest';
import { TreeViewInput } from './tree-view-input';

describe('TreeViewInput Component', () => {
    let onSubmitInput: Mock;
    let onCancelInput: Mock;
    let input: HTMLInputElement;
    Object.defineProperty(window.Element.prototype, 'scroll', {
        writable: true,
        value: vitest.fn(),
    });

    const props = {
        level: 0,
        'aria-label': 'input',
        icon: 'Icon',
        defaultValue: 'My Documents',
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
        input = screen.getByLabelText('input');
    });

    it('should match snapshot', () => {
        const { asFragment } = render(
            <TreeViewInput
                aria-label="input-label"
                onSubmitInput={() => {}}
                onCancelInput={() => {}}
                defaultValue="My Documents"
            />,
        );

        expect(asFragment()).toMatchSnapshot();
    });

    it('should render correctly', () => {
        expect(
            screen.getByDisplayValue(props.defaultValue),
        ).toBeInTheDocument();

        expect(input).toBeInTheDocument();
    });

    it('should call onSubmitInput when press enter key', () => {
        fireEvent.keyUp(input, {
            key: 'Enter',
        });

        expect(onSubmitInput).toHaveBeenCalled();
    });

    it('should call onSubmitInput when click outside', async () => {
        await waitFor(() => input, {
            timeout: 100,
        });
        fireEvent.click(document.body);

        expect(onSubmitInput).toHaveBeenCalled();
    });

    it('should call onCancelInput when press Esc key', () => {
        fireEvent.keyUp(input, {
            key: 'Escape',
        });

        expect(onCancelInput).toHaveBeenCalled();
    });

    it('should call onSubmitInput with text value', () => {
        fireEvent.change(input, {
            target: { value: 'new value' },
        });

        fireEvent.keyUp(input, {
            key: 'Enter',
        });
        expect(onSubmitInput).toHaveBeenCalledWith('new value');
    });
});
