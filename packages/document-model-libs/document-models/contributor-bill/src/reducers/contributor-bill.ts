/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */
import { utils as documentModelUtils } from "document-model/document";
import { ContributorBillContributorBillOperations } from "../../gen/contributor-bill/operations";

export const reducer: ContributorBillContributorBillOperations = {
  createContributorBillOperation(state, action, dispatch) {
    state.issued = action.input.issued;
    state.issuer = action.input.issuer || "";
    state.due = action.input.due || "";
    state.stableComp = [];
    state.powtComp = [];
    state.recipient = action.input.recipient || "";
  },
  addStablecoinLineItemOperation(state, action, dispatch) {
    state.stableComp.push({
      id: documentModelUtils.hashKey(),
      description: action.input.description || "",
      amount: action.input.amount,
      currency: action.input.currency,
    });
  },
  addPowtLineItemOperation(state, action, dispatch) {
    state.powtComp.push({
      id: documentModelUtils.hashKey(),
      description: action.input.description || "",
      amount: action.input.amount,
      projectCode: action.input.projectCode || "",
    });
  },
  updateStablecoinLineItemOperation(state, action, dispatch) {
    const item = state.stableComp.find(
      (item) => item.id === action.input.lineItemId,
    );
    if (item) {
      item.description = action.input.description || "";
      item.amount = action.input.amount || 0;
      item.currency = action.input.currency || "";
    }
  },
  updatePowtLineItemOperation(state, action, dispatch) {
    const item = state.powtComp.find(
      (item) => item.id === action.input.lineItemId,
    );
    if (item) {
      item.description = action.input.description || "";
      item.amount = action.input.amount || 0;
      item.projectCode = action.input.projectCode || "";
    }
  },
  deleteStablecoinLineItemOperation(state, action, dispatch) {
    state.stableComp = state.stableComp.filter(
      (item) => item.id !== action.input.lineItemId,
    );
  },
  deletePowtLineItemOperation(state, action, dispatch) {
    state.powtComp = state.powtComp.filter(
      (item) => item.id !== action.input.lineItemId,
    );
  },
  updateContributorBillOperation(state, action, dispatch) {
    state.issued = action.input.issued || state.issued;
    state.issuer = action.input.issuer || state.issuer;
    state.due = action.input.due || state.due;
    state.recipient = action.input.recipient || state.recipient;
  },
};
