/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { BrandSheetPHState } from "document-models/brand-sheet/v1";

import { brandSheetAgentFeedbackOperations } from "../src/reducers/agent-feedback.js";
import { brandSheetColorsOperations } from "../src/reducers/colors.js";
import { brandSheetIdentityOperations } from "../src/reducers/identity.js";
import { brandSheetImageryOperations } from "../src/reducers/imagery.js";
import { brandSheetLogosOperations } from "../src/reducers/logos.js";
import { brandSheetTypographyOperations } from "../src/reducers/typography.js";
import { brandSheetVoiceOperations } from "../src/reducers/voice.js";

import {
  AddColorInputSchema,
  AddImageryReferenceInputSchema,
  AddLogoInputSchema,
  AddSuggestionInputSchema,
  AddTypefaceInputSchema,
  ClearConceptInputSchema,
  ClearImageryDirectionInputSchema,
  ClearLogoAssetInputSchema,
  ClearMaximInputSchema,
  ClearProductNameInputSchema,
  ClearVoiceInputSchema,
  RemoveColorInputSchema,
  RemoveImageryReferenceInputSchema,
  RemoveLogoInputSchema,
  RemoveSuggestionInputSchema,
  RemoveTypefaceInputSchema,
  ReorderColorsInputSchema,
  ReorderImageryReferencesInputSchema,
  ReorderLogosInputSchema,
  ReorderTypefacesInputSchema,
  ResolveSuggestionInputSchema,
  SetConceptInputSchema,
  SetImageryDirectionInputSchema,
  SetImageryGuidanceInputSchema,
  SetLogoAssetInputSchema,
  SetMaximInputSchema,
  SetProductNameInputSchema,
  SetReadyForFeedbackInputSchema,
  SetVoiceInputSchema,
  SetVoiceVocabularyInputSchema,
  UpdateColorInputSchema,
  UpdateLogoInputSchema,
  UpdateTypefaceInputSchema,
  UpdateVoiceInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<BrandSheetPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "SET_PRODUCT_NAME": {
      SetProductNameInputSchema().parse(action.input);

      brandSheetIdentityOperations.setProductNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_PRODUCT_NAME": {
      ClearProductNameInputSchema().parse(action.input);

      brandSheetIdentityOperations.clearProductNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_MAXIM": {
      SetMaximInputSchema().parse(action.input);

      brandSheetIdentityOperations.setMaximOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_MAXIM": {
      ClearMaximInputSchema().parse(action.input);

      brandSheetIdentityOperations.clearMaximOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_CONCEPT": {
      SetConceptInputSchema().parse(action.input);

      brandSheetIdentityOperations.setConceptOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_CONCEPT": {
      ClearConceptInputSchema().parse(action.input);

      brandSheetIdentityOperations.clearConceptOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_LOGO": {
      AddLogoInputSchema().parse(action.input);

      brandSheetLogosOperations.addLogoOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_LOGO": {
      UpdateLogoInputSchema().parse(action.input);

      brandSheetLogosOperations.updateLogoOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_LOGO_ASSET": {
      SetLogoAssetInputSchema().parse(action.input);

      brandSheetLogosOperations.setLogoAssetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_LOGO_ASSET": {
      ClearLogoAssetInputSchema().parse(action.input);

      brandSheetLogosOperations.clearLogoAssetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_LOGO": {
      RemoveLogoInputSchema().parse(action.input);

      brandSheetLogosOperations.removeLogoOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REORDER_LOGOS": {
      ReorderLogosInputSchema().parse(action.input);

      brandSheetLogosOperations.reorderLogosOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_COLOR": {
      AddColorInputSchema().parse(action.input);

      brandSheetColorsOperations.addColorOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_COLOR": {
      UpdateColorInputSchema().parse(action.input);

      brandSheetColorsOperations.updateColorOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_COLOR": {
      RemoveColorInputSchema().parse(action.input);

      brandSheetColorsOperations.removeColorOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REORDER_COLORS": {
      ReorderColorsInputSchema().parse(action.input);

      brandSheetColorsOperations.reorderColorsOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_TYPEFACE": {
      AddTypefaceInputSchema().parse(action.input);

      brandSheetTypographyOperations.addTypefaceOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_TYPEFACE": {
      UpdateTypefaceInputSchema().parse(action.input);

      brandSheetTypographyOperations.updateTypefaceOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_TYPEFACE": {
      RemoveTypefaceInputSchema().parse(action.input);

      brandSheetTypographyOperations.removeTypefaceOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REORDER_TYPEFACES": {
      ReorderTypefacesInputSchema().parse(action.input);

      brandSheetTypographyOperations.reorderTypefacesOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_VOICE": {
      SetVoiceInputSchema().parse(action.input);

      brandSheetVoiceOperations.setVoiceOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_VOICE": {
      UpdateVoiceInputSchema().parse(action.input);

      brandSheetVoiceOperations.updateVoiceOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_VOICE_VOCABULARY": {
      SetVoiceVocabularyInputSchema().parse(action.input);

      brandSheetVoiceOperations.setVoiceVocabularyOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_VOICE": {
      ClearVoiceInputSchema().parse(action.input);

      brandSheetVoiceOperations.clearVoiceOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_IMAGERY_DIRECTION": {
      SetImageryDirectionInputSchema().parse(action.input);

      brandSheetImageryOperations.setImageryDirectionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_IMAGERY_DIRECTION": {
      ClearImageryDirectionInputSchema().parse(action.input);

      brandSheetImageryOperations.clearImageryDirectionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_IMAGERY_GUIDANCE": {
      SetImageryGuidanceInputSchema().parse(action.input);

      brandSheetImageryOperations.setImageryGuidanceOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_IMAGERY_REFERENCE": {
      AddImageryReferenceInputSchema().parse(action.input);

      brandSheetImageryOperations.addImageryReferenceOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_IMAGERY_REFERENCE": {
      RemoveImageryReferenceInputSchema().parse(action.input);

      brandSheetImageryOperations.removeImageryReferenceOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REORDER_IMAGERY_REFERENCES": {
      ReorderImageryReferencesInputSchema().parse(action.input);

      brandSheetImageryOperations.reorderImageryReferencesOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_READY_FOR_FEEDBACK": {
      SetReadyForFeedbackInputSchema().parse(action.input);

      brandSheetAgentFeedbackOperations.setReadyForFeedbackOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_SUGGESTION": {
      AddSuggestionInputSchema().parse(action.input);

      brandSheetAgentFeedbackOperations.addSuggestionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "RESOLVE_SUGGESTION": {
      ResolveSuggestionInputSchema().parse(action.input);

      brandSheetAgentFeedbackOperations.resolveSuggestionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_SUGGESTION": {
      RemoveSuggestionInputSchema().parse(action.input);

      brandSheetAgentFeedbackOperations.removeSuggestionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer: Reducer<BrandSheetPHState> = createReducer(stateReducer);
