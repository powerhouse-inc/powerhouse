import { render, screen } from '@testing-library/react';

import { WagmiContext } from '@/connect/context/WagmiContext';
import { ConnectSidebar } from '.';

describe('Connect Sidebar Component', () => {
    it('should match snapshot', () => {
        const { asFragment } = render(
            <WagmiContext>
                <ConnectSidebar
                    address="0x123"
                    collapsed={false}
                    data-testid="sidebar"
                    onLogin={() => {}}
                    onToggle={() => {}}
                />
            </WagmiContext>,
        );
        expect(asFragment()).toMatchSnapshot();
    });

    it('should render correctly', () => {
        render(
            <WagmiContext>
                <ConnectSidebar
                    address="0x123"
                    collapsed={false}
                    data-testid="sidebar"
                    onLogin={() => {}}
                    onToggle={() => {}}
                />
            </WagmiContext>,
        );
        expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    });

    it('should render expanded', () => {
        render(
            <WagmiContext>
                <ConnectSidebar
                    address="0x123"
                    collapsed={false}
                    data-testid="sidebar"
                    onLogin={() => {}}
                    onToggle={() => {}}
                />
            </WagmiContext>,
        );
        expect(screen.getByTestId('sidebar')).toHaveStyle({ width: '304px' });
    });

    it('should render collapsed', () => {
        render(
            <WagmiContext>
                <ConnectSidebar
                    address="0x123"
                    collapsed
                    data-testid="sidebar"
                    onLogin={() => {}}
                    onToggle={() => {}}
                />
            </WagmiContext>,
        );
        expect(screen.getByTestId('sidebar')).toHaveStyle({ width: '58px' });
    });
});
