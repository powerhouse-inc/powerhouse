import { render, screen } from '@testing-library/react';

import { Sidebar, SidebarFooter, SidebarHeader, SidebarPanel } from '.';

describe('Sidebar Component', () => {
    it('should match snapshot', () => {
        const { asFragment } = render(
            <Sidebar collapsed={false} maxWidth={'300px'} minWidth={'100px'}>
                <SidebarPanel>
                    <SidebarHeader />
                </SidebarPanel>
                <SidebarFooter />
            </Sidebar>,
        );
        expect(asFragment()).toMatchSnapshot();
    });

    it('should render correctly', () => {
        render(
            <Sidebar
                data-testid="sidebar"
                collapsed={true}
                maxWidth={'300px'}
                minWidth={'100px'}
            />,
        );
        expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    });

    it('should render expanded', () => {
        render(
            <Sidebar
                data-testid="sidebar"
                collapsed={false}
                maxWidth={'300px'}
                minWidth={'100px'}
            />,
        );
        expect(screen.getByTestId('sidebar')).toHaveStyle({ width: '300px' });
    });

    it('should render collapsed', () => {
        render(
            <Sidebar
                data-testid="sidebar"
                collapsed={true}
                maxWidth={'300px'}
                minWidth={'100px'}
            />,
        );
        expect(screen.getByTestId('sidebar')).toHaveStyle({ width: '100px' });
    });
});
