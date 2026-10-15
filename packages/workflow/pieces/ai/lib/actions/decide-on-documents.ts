import { createAction, Property } from "@powerhousedao/pieces-framework";
import type { Experimental_DecisionModel } from "ai";
import { aiAuth, readConnection } from "../auth.js";
import {
  documentsProp,
  filterProp,
  optionalText,
  parseDocumentIds,
  readDocumentViews,
  type DocumentReader,
} from "../documents.js";
import { createDecisionModel, resolveModelId } from "../models.js";
import { modelProp } from "../props.js";
import { parseQuestions, toDecisionState } from "../questions.js";
import { decide, questionsProp } from "./decide.js";

// The documents go to the model as compact views: no operations or headers.
export async function decideOnDocuments(
  model: Experimental_DecisionModel,
  reactor: DocumentReader,
  props: {
    documents?: unknown;
    input?: unknown;
    questions?: unknown;
    filter?: unknown;
  },
) {
  const ids = parseDocumentIds(props.documents);
  if (ids.length === 0) throw new Error("Choose at least one document.");
  const questions = parseQuestions(props.questions);
  const documents = await readDocumentViews(
    reactor,
    ids,
    optionalText(props.filter),
  );
  const { input } = props;
  const hasInput =
    input !== undefined &&
    input !== null &&
    !(typeof input === "string" && !input.trim());
  return decide(
    model,
    toDecisionState(hasInput ? { documents, input } : { documents }),
    questions,
  );
}

export const decideOnDocumentsAction = createAction({
  auth: aiAuth,
  name: "decide_on_documents",
  displayName: "Decide on documents",
  description:
    "Answer named questions about documents on this reactor: pick an option, score on a scale, or estimate a yes/no probability.",
  requireReactor: "read",
  defaultTimeoutSeconds: 120,
  props: {
    documents: documentsProp("Documents", true),
    input: Property.LongText({
      displayName: "Additional input",
      required: false,
      description: "Text or JSON decided on alongside the documents.",
    }),
    questions: questionsProp(),
    filter: filterProp(),
    model: modelProp(),
  },
  run: async (ctx) => {
    const connection = readConnection(ctx.auth);
    const modelId = resolveModelId(connection, ctx.propsValue.model);
    const result = await decideOnDocuments(
      await createDecisionModel(connection, modelId),
      ctx.reactor,
      ctx.propsValue,
    );
    return { ...result, provider: connection.provider, model: modelId };
  },
});
