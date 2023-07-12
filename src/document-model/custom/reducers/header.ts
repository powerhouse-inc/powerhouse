import { DocumentModelHeaderOperations } from '../../gen/header/operations';

export const reducer: DocumentModelHeaderOperations = {
    setModelNameOperation(state, action) {
        state.state.name = action.input.name;
    },

    setModelIdOperation(state, action) {
        state.state.id = action.input.id;
    },

    setModelExtensionOperation(state, action) {
        state.state.extension = action.input.extension;
    },

    setModelDescriptionOperation(state, action) {
        state.state.description = action.input.description;
    },

    setAuthorNameOperation(state, action) {
        state.state.author = state.state.author || { name: '', website: null };
        state.state.author.name = action.input.authorName;
    },

    setAuthorWebsiteOperation(state, action) {
        state.state.author = state.state.author || { name: '', website: null };
        state.state.author.website = action.input.authorWebsite;
    },
};
