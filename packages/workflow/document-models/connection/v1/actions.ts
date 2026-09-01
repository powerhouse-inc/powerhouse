/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { baseActions } from "document-model";
import {
  connectionConfigActions,
  connectionConnectionActions,
  connectionHealthActions,
} from "./gen/creators.js";

/** Actions for the Connection document model */

export const actions = {
  ...baseActions,
  ...connectionConnectionActions,
  ...connectionConfigActions,
  ...connectionHealthActions,
};
