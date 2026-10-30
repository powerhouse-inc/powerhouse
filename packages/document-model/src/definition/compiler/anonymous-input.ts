import { registerTypeDescriptor } from "../dsl/descriptor-registry.js";
import { assertAuthoredName, assertNamedType } from "../dsl/field-options.js";
import type { InputDescriptor, ObjectFields } from "../dsl/types.js";

export function nameAnonymousInput<TFields extends ObjectFields>(
  descriptor: InputDescriptor<TFields>,
  name: string,
): InputDescriptor<TFields> {
  assertNamedType(
    descriptor,
    ["descriptor"],
    "PH-DEF-REFERENCE-TARGET-INVALID",
    "Pass a descriptor returned by ph.input.",
  );
  if (descriptor.name !== null) return descriptor;
  const validName = assertAuthoredName(name, ["name"]);
  return registerTypeDescriptor(
    Object.freeze({
      ...descriptor,
      name: validName,
      identity: Object.freeze({
        kind: "input" as const,
        name: validName,
        description: descriptor.description,
      }),
    }),
  );
}
