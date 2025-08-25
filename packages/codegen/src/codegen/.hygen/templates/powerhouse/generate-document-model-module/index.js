// @ts-check
const { paramCase } = require("change-case");

module.exports = {
  params: ({ args }) => {
    const documentModel = JSON.parse(args.documentModel);
    const latestSpec =
      documentModel.specifications[documentModel.specifications.length - 1];
    const filteredModules = latestSpec.modules.filter(
      (m) => m.name === args.module,
    );

    const actions =
      filteredModules.length > 0
        ? filteredModules[0].operations.map((a) => ({
            name: a.name,
            hasInput: a.schema !== null,
            hasAttachment: a.schema?.includes(": Attachment"),
            scope: a.scope || "global",
            state: a.scope === "global" ? "" : a.scope, // the state this action affects
            errors: a.errors,
          }))
        : [];

    const errors = actions.reduce((acc, action) => {
      action.errors.forEach((error) => {
        const existingError = acc.find((e) => e.code === error.code);
        if (!existingError) {
          acc.push(error);
        } else if (JSON.stringify(existingError) !== JSON.stringify(error)) {
          console.warn(
            `Warning: Duplicate error code "${error.code}" with different fields found`,
          );
        }
      });
      return acc;
    }, []);

    return {
      rootDir: args.rootDir,
      documentType: documentModel.name,
      module: paramCase(args.module),
      actions,
      errors,
    };
  },
};
