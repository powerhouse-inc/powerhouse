import { fireEvent, render, screen } from '@testing-library/react';
import { TextInput } from './text-input';

describe('Modal Component', () => {
    it('should match snapshot', () => {
        const { asFragment } = render(
            <TextInput
                startAdornment={<div>Start</div>}
                endAdornment={<div>End</div>}
                className="rounded-2xl bg-white p-2"
                textFieldProps={{ 'aria-label': 'test' }}
            />,
        );

        expect(asFragment()).toMatchSnapshot();
    });

    it('should render start adornment', () => {
        render(
            <TextInput
                startAdornment={<div>Start</div>}
                endAdornment={<div>End</div>}
                className="rounded-2xl bg-white p-2"
                textFieldProps={{ 'aria-label': 'test' }}
            />,
        );

        expect(screen.getByText('Start')).toBeInTheDocument();
    });

    it('should render end adornment', () => {
        render(
            <TextInput
                startAdornment={<div>Start</div>}
                endAdornment={<div>End</div>}
                className="rounded-2xl bg-white p-2"
                textFieldProps={{ 'aria-label': 'test' }}
            />,
        );

        expect(screen.getByText('End')).toBeInTheDocument();
    });

    it('should call onChange when input value change', () => {
        const onChange = jest.fn();

        render(
            <TextInput
                startAdornment={<div>Start</div>}
                endAdornment={<div>End</div>}
                className="rounded-2xl bg-white p-2"
                textFieldProps={{ 'aria-label': 'test' }}
                onChange={onChange}
            />,
        );

        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: 'test' },
        });

        expect(onChange).toHaveBeenCalled();
        expect(onChange).toHaveBeenCalledWith('test');
    });
});
