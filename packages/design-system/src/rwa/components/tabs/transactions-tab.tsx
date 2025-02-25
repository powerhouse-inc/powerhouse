import { GroupTransactionsTable, RwaTabContent } from "@/rwa";

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
