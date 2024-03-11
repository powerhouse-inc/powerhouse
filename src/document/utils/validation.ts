import {
    DocumentOperations,
    Action,
    ValidationError,
    OperationScope,
} from '../types';

export function validateOperations<A extends Action>(
    operations: DocumentOperations<A>,
) {
    const errors: ValidationError[] = [];
    const scopes = Object.keys(operations) as OperationScope[];

    for (const scope of scopes) {
        const ops = operations[scope].sort((a, b) => a.index - b.index);

        for (let i = 0; i < ops.length; i++) {
            if (ops[i].index !== i) {
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
