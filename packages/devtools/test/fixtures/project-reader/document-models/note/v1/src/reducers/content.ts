import type { NoteState } from "../../gen/types.js";

// SET_TITLE differs from the specification's text, and ARCHIVE is not here.
export const noteContentOperations = {
  setTitleOperation(state: NoteState, action: { input: { title: string } }) {
    const title = action.input.title.trim();
    state.title = title;
  },
};
