import type { BrandSheetVoiceOperations } from "document-models/brand-sheet/v1";
import { VoiceNotSetError } from "../../gen/voice/error.js";

export const brandSheetVoiceOperations: BrandSheetVoiceOperations = {
  setVoiceOperation(state, action) {
    state.voice = {
      qualities: action.input.qualities,
      guidance: action.input.guidance,
      vocabulary: { prefer: [], avoid: [] },
    };
  },
  updateVoiceOperation(state, action) {
    if (!state.voice) {
      throw new VoiceNotSetError("No voice block to update.");
    }
    if (action.input.qualities) state.voice.qualities = action.input.qualities;
    if (action.input.guidance) state.voice.guidance = action.input.guidance;
  },
  setVoiceVocabularyOperation(state, action) {
    if (!state.voice) {
      throw new VoiceNotSetError("No voice block to set vocabulary on.");
    }
    state.voice.vocabulary = {
      prefer: action.input.prefer,
      avoid: action.input.avoid,
    };
  },
  clearVoiceOperation(state) {
    state.voice = null;
  },
};
