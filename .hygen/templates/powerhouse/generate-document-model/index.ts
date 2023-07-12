export default {
    params: ({ args }) => {
        const documentModel = JSON.parse(args.documentModel);
        return {
            documentType: documentModel.name,
            extension: documentModel.extension,
            modules: documentModel.modules,
        };
    },
};
