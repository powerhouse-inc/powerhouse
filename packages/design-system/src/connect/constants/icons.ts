import BudgetStatementImg from "@powerhousedao/design-system/assets/icons/budget.png";
import MakerdaoRWAPortfolioImg from "@powerhousedao/design-system/assets/icons/rwa-report.png";
import DefaultImg from "@powerhousedao/design-system/assets/icons/template.png";
import type { TDocumentType } from "@powerhousedao/design-system";
import {
  BUDGET,
  DEFAULT,
  MAKERDAO_RWA_PORTFOLIO,
} from "@powerhousedao/design-system";

export const iconMap: Record<TDocumentType, string> = {
  [BUDGET]: BudgetStatementImg,
  [DEFAULT]: DefaultImg,
  [MAKERDAO_RWA_PORTFOLIO]: MakerdaoRWAPortfolioImg,
};
