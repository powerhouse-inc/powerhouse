import {
  GroupTransactionsTable,
  RwaTabContent,
} from "@powerhousedao/design-system";

export function TransactionsTab() {
  return (
    <RwaTabContent
      description="Details on the distribution of assets among different financial institutions or investment vehicles."
      label="Transactions"
    >
      <GroupTransactionsTable />
    </RwaTabContent>
  );
}
