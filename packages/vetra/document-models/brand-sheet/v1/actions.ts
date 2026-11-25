/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { baseActions } from "document-model";
import {
  brandSheetAgentFeedbackActions,
  brandSheetColorsActions,
  brandSheetIdentityActions,
  brandSheetImageryActions,
  brandSheetLogosActions,
  brandSheetTypographyActions,
  brandSheetVoiceActions,
} from "./gen/creators.js";

/** Actions for the BrandSheet document model */

export const actions = {
  ...baseActions,
  ...brandSheetIdentityActions,
  ...brandSheetLogosActions,
  ...brandSheetColorsActions,
  ...brandSheetTypographyActions,
  ...brandSheetVoiceActions,
  ...brandSheetImageryActions,
  ...brandSheetAgentFeedbackActions,
};
