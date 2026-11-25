import type { NoteState } from "../../gen/types.js";

// ADD_TAG is an arrow function, and REMOVE_TAG is not here.
export const noteTagsOperations = {
  addTagOperation: (state: NoteState, action: { input: { label: string } }) => {
    state.tags.push({ label: action.input.label });
  },
};
