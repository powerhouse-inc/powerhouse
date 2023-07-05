import { DocumentModelHeaderOperations } from '../../gen/header/operations';

export const reducer: DocumentModelHeaderOperations = {
    setModelNameOperation(state, action) {
        state.data.name = action.input.name;
    },

    setModelIdOperation(state, action) {
        state.data.id = action.input.id;
    },

    setModelExtensionOperation(state, action) {
        state.data.extension = action.input.extension;
    },

    setModelDescriptionOperation(state, action) {
        state.data.description = action.input.description;
    },

    setAuthorNameOperation(state, action) {
        state.data.author = state.data.author || { name: '', website: null };
        state.data.author.name = action.input.authorName;
    },

    setAuthorWebsiteOperation(state, action) {
        state.data.author = state.data.author || { name: '', website: null };
        state.data.author.website = action.input.authorWebsite;
    },
}