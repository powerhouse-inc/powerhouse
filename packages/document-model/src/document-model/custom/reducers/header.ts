import { DocumentModelHeaderOperations } from '../../gen/header/operations';

export const reducer: DocumentModelHeaderOperations = {
    setModelNameOperation(state, action) {
        state.name = action.input.name;
    },

    setModelIdOperation(state, action) {
        state.id = action.input.id;
    },

    setModelExtensionOperation(state, action) {
        state.extension = action.input.extension;
    },

    setModelDescriptionOperation(state, action) {
        state.description = action.input.description;
    },

    setAuthorNameOperation(state, action) {
        state.author = state.author || { name: '', website: null };
        state.author.name = action.input.authorName;
    },

    setAuthorWebsiteOperation(state, action) {
        state.author = state.author || { name: '', website: null };
        state.author.website = action.input.authorWebsite;
    },
};
