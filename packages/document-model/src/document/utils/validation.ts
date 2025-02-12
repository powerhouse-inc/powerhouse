import {
  DocumentOperations,
  OperationScope,
  ValidationError,
} from "@document/types.js";

export function validateOperations<TGlobalState, TLocalState>(
  operations: DocumentOperations<TGlobalState, TLocalState>,
) {
  const errors: ValidationError[] = [];
  const scopes = Object.keys(operations) as OperationScope[];

  for (const scope of scopes) {
    const ops = operations[scope].sort((a, b) => a.index - b.index);

    let opIndex = -1;

    for (let i = 0; i < ops.length; i++) {
      opIndex = opIndex + 1 + ops[i].skip;
      if (ops[i].index !== opIndex) {
        errors.push({
          message: `Invalid operation index ${ops[i].index} at position ${i}`,
          details: {
            position: i,
            operation: ops[i],
            scope: ops[i].scope,
          },
        });
      }
    }
  }

  return errors;
}
