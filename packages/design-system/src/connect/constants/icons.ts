import BudgetStatementImg from "@/assets/icons/budget.png";
import MakerdaoRWAPortfolioImg from "@/assets/icons/rwa-report.png";
import DefaultImg from "@/assets/icons/template.png";
import {
  BUDGET,
  DEFAULT,
  MAKERDAO_RWA_PORTFOLIO,
  type TDocumentType,
} from "@/connect";

export const iconMap: Record<TDocumentType, string> = {
  [BUDGET]: BudgetStatementImg,
  [DEFAULT]: DefaultImg,
  [MAKERDAO_RWA_PORTFOLIO]: MakerdaoRWAPortfolioImg,
};
