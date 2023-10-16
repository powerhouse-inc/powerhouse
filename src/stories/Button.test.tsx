import { render, screen } from '@testing-library/react';

import { Button } from '../components/button';

describe('Button Component', () => {
    it('should match snapshot', () => {
        const { asFragment } = render(<Button label="Click me please" />);
        expect(asFragment()).toMatchSnapshot();
    });

    it('should render correctly', () => {
        render(<Button label="Click me please" />);
        expect(screen.getByText('Click me please')).toBeInTheDocument();
    });
});
