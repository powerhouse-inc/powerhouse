import { buildForged } from "./base.js";

/**
 * A definition edited so two operations persist one action type. A generated
 * switch is first-match-wins and a compiled dispatch table is last-write-wins,
 * so a history replayed through the two approaches would diverge.
 */
const module = buildForged();
const [specification] = module.definition.specifications;
const [valuesModule] = specification.modules;
const [setValue] = valuesModule.operations;

export const duplicated = {
  ...module,
  definition: {
    ...module.definition,
    specifications: [
      {
        ...specification,
        modules: [
          {
            ...valuesModule,
            operations: [
              setValue,
              {
                ...setValue,
                id: `${setValue.id}-2`,
                key: "setValueAgain",
                creatorKey: "setValueAgain",
              },
            ],
          },
        ],
      },
    ],
  },
};
