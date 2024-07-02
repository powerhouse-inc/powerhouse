import { render, screen } from '@testing-library/react';

import { WagmiContext } from '@/connect/context/WagmiContext';
import { ConnectSidebar } from '.';

describe('Connect Sidebar Component', () => {
    it('should match snapshot', () => {
        const { asFragment } = render(
            <WagmiContext>
                <ConnectSidebar
                    data-testid="sidebar"
                    onToggle={() => {}}
                    address="0x123"
                    collapsed={false}
                    onLogin={() => {}}
                />
            </WagmiContext>,
        );
        expect(asFragment()).toMatchSnapshot();
    });

    it('should render correctly', () => {
        render(
            <WagmiContext>
                <ConnectSidebar
                    data-testid="sidebar"
                    onToggle={() => {}}
                    address="0x123"
                    collapsed={false}
                    onLogin={() => {}}
                />
            </WagmiContext>,
        );
        expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    });

    it('should render expanded', () => {
        render(
            <WagmiContext>
                <ConnectSidebar
                    data-testid="sidebar"
                    onToggle={() => {}}
                    address="0x123"
                    collapsed={false}
                    onLogin={() => {}}
                />
            </WagmiContext>,
        );
        expect(screen.getByTestId('sidebar')).toHaveStyle({ width: '304px' });
    });

    it('should render collapsed', () => {
        render(
            <WagmiContext>
                <ConnectSidebar
                    data-testid="sidebar"
                    onToggle={() => {}}
                    address="0x123"
                    collapsed={true}
                    onLogin={() => {}}
                />
            </WagmiContext>,
        );
        expect(screen.getByTestId('sidebar')).toHaveStyle({ width: '58px' });
    });
});
