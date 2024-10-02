import { AssetsTable, AssetsTableProps } from '../table';
import { TabContent } from './tab-content';

export function PortfolioTab(props: AssetsTableProps) {
    const tabProps = {
        label: 'Portfolio',
        description:
            'Details on the distribution of assets among different financial institutions or investment vehicles.',
    };
    return (
        <TabContent {...tabProps}>
            <AssetsTable {...props} />
        </TabContent>
    );
}
