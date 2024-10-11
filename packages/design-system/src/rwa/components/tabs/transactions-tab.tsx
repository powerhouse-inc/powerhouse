import { GroupTransactionsTable, TabContent } from "@/rwa";

export function TransactionsTab() {
  return (
    <TabContent
      description="Details on the distribution of assets among different financial institutions or investment vehicles."
      label="Transactions"
    >
      <GroupTransactionsTable />
    </TabContent>
  );
}
