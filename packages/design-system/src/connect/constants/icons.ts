import type { TDocumentType } from "@powerhousedao/design-system";
import { BUDGET, DEFAULT, MAKERDAO_RWA_PORTFOLIO } from "./documents.js";

const BudgetStatementImg = new URL('../../../../../assets/icons/budget.png', import.meta.url).href
const MakerdaoRWAPortfolioImg = new URL('../../../../../assets/icons/rwa-report.png', import.meta.url).href
const DefaultImg = new URL('../../../../../assets/icons/template.png', import.meta.url).href

export const iconMap: Record<TDocumentType, string> = {
  [BUDGET]: BudgetStatementImg,
  [DEFAULT]: DefaultImg,
  [MAKERDAO_RWA_PORTFOLIO]: MakerdaoRWAPortfolioImg,
};
