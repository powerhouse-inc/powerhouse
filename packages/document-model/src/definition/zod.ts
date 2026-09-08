import {
  BaseDocumentHeaderSchema,
  type JsonValue,
  type PHBaseState,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { z, ZodError } from "zod";
import { failDefinition } from "./diagnostics.js";
import { assertJsonValue } from "./primitives.js";
import type { StateRootDescriptor } from "./types.js";

export type SerializedInitialValue = {
  readonly value: JsonValue;
  readonly serialized: string;
};

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

/**
 * Reproduces the generated-model initial-state path: JSON.stringify first,
 * parse the stored bytes, validate that parsed value, and ignore Zod's copy.
 */
export function serializeAndValidateInitialValue(
  descriptor: StateRootDescriptor,
  initialValue: unknown,
  path: readonly (string | number)[],
): SerializedInitialValue {
  let serialized: string | undefined;
  try {
    serialized = (JSON.stringify as (value: unknown) => string | undefined)(
      initialValue,
    );
  } catch (error) {
    return failDefinition({
      code: "PH-DM-INITIAL-VALUE-NOT-SERIALIZABLE",
      path,
      message: `The initial value could not be serialized: ${error instanceof Error ? error.message : String(error)}`,
      repair:
        "Use a value accepted by JSON.stringify and the declared state schema.",
    });
  }

  if (serialized === undefined) {
    return failDefinition({
      code: "PH-DM-INITIAL-VALUE-NOT-SERIALIZABLE",
      path,
      message: "The initial value did not produce a stored JSON string.",
      repair:
        "Use an object value accepted by JSON.stringify and the declared state schema.",
    });
  }

  const parsed = JSON.parse(serialized) as unknown;
  try {
    assertJsonValue(parsed);
    descriptor.validator.parse(parsed);
  } catch (error) {
    return failDefinition({
      code: "PH-DM-INITIAL-VALUE-INVALID",
      path,
      message:
        error instanceof ZodError
          ? `The serialized initial value does not match its schema: ${formatZodError(error)}`
          : `The serialized initial value is invalid: ${error instanceof Error ? error.message : String(error)}`,
      repair:
        "Make the initial value satisfy every required field and scalar validator in its state schema.",
    });
  }

  return { value: parsed, serialized };
}

export function createDocumentRuntimeSchemas<
  TState extends PHBaseState,
>(options: {
  readonly documentType: string;
  readonly global: StateRootDescriptor;
}) {
  // Generated model schemas intentionally validate the global projection only.
  // Keep that behavior until the legacy schema contract changes for every model.
  const stateSchema = z.object({ global: options.global.validator });
  const headerSchema = BaseDocumentHeaderSchema.extend({
    documentType: z.literal(options.documentType),
  });
  const documentSchema = z.object({
    header: headerSchema,
    state: stateSchema,
    initialState: stateSchema,
  });

  const isState = (state: unknown): state is TState =>
    stateSchema.safeParse(state).success;
  const assertState = (state: unknown): asserts state is TState => {
    stateSchema.parse(state);
  };
  const isDocument = (document: unknown): document is PHDocument<TState> =>
    documentSchema.safeParse(document).success;
  const assertDocument = (
    document: unknown,
  ): asserts document is PHDocument<TState> => {
    documentSchema.parse(document);
  };
  return { isState, assertState, isDocument, assertDocument };
}
