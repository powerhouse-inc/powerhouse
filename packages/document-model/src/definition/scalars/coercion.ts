import type { ScalarRepresentation } from "@powerhousedao/shared/document-model";
import type { z } from "zod";
import type {
  ResolvedScalarDeclaration,
  ScalarCoercion,
} from "./declaration.js";
import {
  type ScalarLiteralNode,
  scalarLiteralValue,
} from "./scalar-literal.js";

export function validatingCoercion<TBase>(
  validator: z.ZodType<TBase>,
  readLiteral: (node: ScalarLiteralNode) => unknown,
): ScalarCoercion<TBase> {
  const parse = (value: unknown): TBase => validator.parse(value);
  return {
    parseValue: parse,
    parseLiteral: (node) => parse(readLiteral(node)),
    serialize: parse,
  };
}

const LITERAL_KINDS: Partial<
  Record<ScalarRepresentation, readonly ScalarLiteralNode["kind"][]>
> = {
  string: ["string"],
  number: ["int", "float"],
  boolean: ["boolean"],
  "json-object": ["object"],
};

export function deriveCoercion(
  declaration: ResolvedScalarDeclaration,
): ScalarCoercion<unknown> {
  const allowed = LITERAL_KINDS[declaration.representation];
  return validatingCoercion(declaration.validator, (node) => {
    if (allowed !== undefined && !allowed.includes(node.kind)) {
      throw new TypeError(
        `${declaration.name} cannot coerce a ${node.kind} literal.`,
      );
    }
    return scalarLiteralValue(node);
  });
}
