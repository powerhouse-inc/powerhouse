import { GroupTransactionsTable } from "../table/transactions/group-transactions-table.js";
import { RwaTabContent } from "./rwa-tab-content.js";

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
