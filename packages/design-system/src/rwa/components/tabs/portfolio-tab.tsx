import { AssetsTable, TabContent } from "@/rwa";

export function PortfolioTab() {
  return (
    <TabContent
      description="Details on the distribution of assets among different financial institutions or investment vehicles."
      label="Portfolio"
    >
      <AssetsTable />
    </TabContent>
  );
}
