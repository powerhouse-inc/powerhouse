import { render, screen } from '@testing-library/react';

import { ConnectSidebar } from '.';

describe('Connect Sidebar Component', () => {
    it('should match snapshot', () => {
        const { asFragment } = render(
            <ConnectSidebar
                data-testid="sidebar"
                onToggle={() => {}}
                username="Willow"
                address="0x123"
                collapsed={false}
                onLogin={() => {}}
            />,
        );
        expect(asFragment()).toMatchSnapshot();
    });

    it('should render correctly', () => {
        render(
            <ConnectSidebar
                data-testid="sidebar"
                onToggle={() => {}}
                username="Willow"
                address="0x123"
                collapsed={false}
                onLogin={() => {}}
            />,
        );
        expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    });

    it('should render expanded', () => {
        render(
            <ConnectSidebar
                data-testid="sidebar"
                onToggle={() => {}}
                username="Willow"
                address="0x123"
                collapsed={false}
                onLogin={() => {}}
            />,
        );
        expect(screen.getByTestId('sidebar')).toHaveStyle({ width: '304px' });
    });

    it('should render collapsed', () => {
        render(
            <ConnectSidebar
                data-testid="sidebar"
                onToggle={() => {}}
                username="Willow"
                address="0x123"
                collapsed={true}
                onLogin={() => {}}
            />,
        );
        expect(screen.getByTestId('sidebar')).toHaveStyle({ width: '58px' });
    });
});
