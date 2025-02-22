import { AssetsTable, RwaTabContent } from "@/rwa";

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
