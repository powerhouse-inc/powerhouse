import { GroupTransactionsTable, GroupTransactionsTableProps } from '../table';
import { TabContent } from './tab-content';

export function TransactionsTab(props: GroupTransactionsTableProps) {
    const tabProps = {
        label: 'Transactions',
        description:
            'Details on the distribution of assets among different financial institutions or investment vehicles.',
    };
    return (
        <TabContent {...tabProps}>
            <GroupTransactionsTable {...props} />
        </TabContent>
    );
}
