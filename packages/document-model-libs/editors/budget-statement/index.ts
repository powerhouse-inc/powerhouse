export const module: ExtendedEditor<
  BudgetStatementState,
  BudgetStatementAction,
  BudgetStatementLocalState
> = {
  Component: lazyWithPreload(() => import("./editor")),
  documentTypes: ["powerhouse/budget-statement"],
  config: {
    id: "budget-statement-editor",
    disableExternalControls: false,
  },
};

export default module;
