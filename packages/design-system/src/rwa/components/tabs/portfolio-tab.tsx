import { AssetsTable, RwaTabContent } from "@powerhousedao/design-system";

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
