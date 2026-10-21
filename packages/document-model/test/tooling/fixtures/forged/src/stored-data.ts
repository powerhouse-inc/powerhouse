import { buildForged } from "./base.js";

/**
 * A module whose stored initial value was edited after compilation. A stored
 * string is not an independent setting: every existing document was created
 * from it, so a definition and its stored bytes disagreeing is a defect the
 * check has to name rather than pick a winner for.
 */
const module = buildForged();
const stored = module.documentModel;
const [specification] = stored.global.specifications;

export const tampered = {
  ...module,
  documentModel: {
    ...stored,
    global: {
      ...stored.global,
      specifications: [
        {
          ...specification,
          state: {
            ...specification.state,
            global: {
              ...specification.state.global,
              initialValue: '{"value":"tampered"}',
            },
          },
        },
      ],
    },
  },
};
