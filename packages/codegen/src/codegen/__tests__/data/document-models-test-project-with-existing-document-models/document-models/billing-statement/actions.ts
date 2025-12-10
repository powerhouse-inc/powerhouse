import { baseActions } from "document-model";
import {
  generalActions,
  lineItemsActions,
  tagsActions,
} from "./gen/creators.js";

/** Actions for the BillingStatement document model */
export const actions = {
  ...baseActions,
  ...generalActions,
  ...lineItemsActions,
  ...tagsActions,
};
