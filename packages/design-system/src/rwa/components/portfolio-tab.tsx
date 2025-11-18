import { AssetsTable } from "./assets-table.js";
import { RwaTabContent } from "./rwa-tab-content.js";

export function PortfolioTab() {
  return (
    <RwaTabContent
      description="Details on the distribution of assets among different financial institutions or investment vehicles."
      label="Portfolio"
    >
      <AssetsTable />
    </RwaTabContent>
  );
}
