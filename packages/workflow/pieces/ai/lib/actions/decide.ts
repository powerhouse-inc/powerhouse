import { createAction, Property } from "@powerhousedao/pieces-framework";
import {
  experimental_decide,
  type Experimental_DecisionModel,
  type Experimental_DecisionQuestion,
} from "ai";
import { aiAuth, readConnection } from "../auth.js";
import { createDecisionModel, resolveModelId } from "../models.js";
import { modelProp } from "../props.js";
import {
  parseQuestions,
  toDecisionState,
  type DecisionState,
} from "../questions.js";

export async function decide(
  model: Experimental_DecisionModel,
  state: DecisionState,
  questions: Record<string, Experimental_DecisionQuestion>,
) {
  const result = await experimental_decide({ model, state, questions });
  return {
    answers: result.answers,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    },
  };
}

// The editor rows parseQuestions reads.
export const questionsProp = () =>
  Property.Array({
    displayName: "Questions",
    required: true,
    properties: {
      key: Property.ShortText({
        displayName: "Key",
        required: true,
        description: "Name of the answer in the output, e.g. urgency.",
      }),
      type: Property.StaticDropdown({
        displayName: "Type",
        required: true,
        defaultValue: "choice",
        options: {
          options: [
            { label: "Choice: pick one option", value: "choice" },
            { label: "Score: place on ordered levels", value: "score" },
            { label: "Boolean: probability of yes", value: "boolean" },
          ],
        },
      }),
      instructions: Property.LongText({
        displayName: "Question",
        required: true,
      }),
      options: Property.LongText({
        displayName: "Options",
        required: false,
        description:
          'One per line. Choice: "key: description". Score: levels from lowest to highest. Boolean (optional): "true: ..." and "false: ...".',
      }),
    },
  });

export const decideAction = createAction({
  auth: aiAuth,
  name: "decide",
  displayName: "Decide",
  description:
    "Answer named questions about an input: pick an option, score on a scale, or estimate a yes/no probability. Branch on the answers.",
  defaultTimeoutSeconds: 120,
  props: {
    input: Property.LongText({
      displayName: "Input",
      required: true,
      description:
        "Text or JSON to decide about, usually from an earlier step.",
    }),
    questions: questionsProp(),
    model: modelProp(),
  },
  run: async (ctx) => {
    const connection = readConnection(ctx.auth);
    const modelId = resolveModelId(connection, ctx.propsValue.model);
    const result = await decide(
      await createDecisionModel(connection, modelId),
      toDecisionState(ctx.propsValue.input),
      parseQuestions(ctx.propsValue.questions),
    );
    return { ...result, provider: connection.provider, model: modelId };
  },
});
