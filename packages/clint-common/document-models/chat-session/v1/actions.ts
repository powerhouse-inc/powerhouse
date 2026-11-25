/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { baseActions } from "document-model";
import {
  chatSessionAgentActions,
  chatSessionSystemActions,
  chatSessionToolActions,
  chatSessionUserActions,
} from "./gen/creators.js";

/** Actions for the ChatSession document model */

export const actions = {
  ...baseActions,
  ...chatSessionSystemActions,
  ...chatSessionUserActions,
  ...chatSessionAgentActions,
  ...chatSessionToolActions,
};
